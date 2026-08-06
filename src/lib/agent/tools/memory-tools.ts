import fs from "node:fs";
import path from "node:path";
import type { MemoryItem, ToolSpec } from "../types";
import { redactSecrets } from "../guardrails";
import { memoryDir } from "../paths";
import { parseArgsObject } from "./registry";

/** Tools that warrant a brief episode distill after a successful run (C3-02 light). */
const DISTILL_TRIGGER_TOOLS = new Set(["write_file", "workflow_create_task"]);

function ensureMem(root: string): string {
  const dir = memoryDir(root);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function memFile(root: string): string {
  return path.join(ensureMem(root), "user-memory.json");
}

export function loadMemories(workspaceRoot: string): MemoryItem[] {
  const f = memFile(workspaceRoot);
  if (!fs.existsSync(f)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(f, "utf8")) as MemoryItem[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveMemories(workspaceRoot: string, items: MemoryItem[]): void {
  fs.writeFileSync(memFile(workspaceRoot), JSON.stringify(items, null, 2), "utf8");
}

const MEMORY_KINDS: MemoryItem["kind"][] = [
  "preference",
  "fact",
  "procedure",
  "episode",
];

function normalizeTags(tags?: string | string[]): string[] {
  if (Array.isArray(tags)) {
    return tags.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

/** Persist one memory (disk SSOT under workspace/.agent/memory/). */
export function writeMemory(
  workspaceRoot: string,
  input: {
    content: string;
    kind?: string;
    tags?: string | string[];
    source?: string;
  },
): { item: MemoryItem; total: number } {
  const content = input.content.trim();
  if (!content) {
    throw new Error("content required");
  }
  const kindRaw = (input.kind || "fact").trim() as MemoryItem["kind"];
  const kind = MEMORY_KINDS.includes(kindRaw) ? kindRaw : "fact";
  const tags = normalizeTags(input.tags);
  const now = new Date().toISOString();
  const items = loadMemories(workspaceRoot);
  const item: MemoryItem = {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    content,
    tags,
    createdAt: now,
    updatedAt: now,
    source: input.source,
  };
  items.push(item);
  // Cap 500
  const trimmed = items.slice(-500);
  saveMemories(workspaceRoot, trimmed);
  return { item, total: trimmed.length };
}

export function createMemoryTools(): ToolSpec[] {
  return [
    {
      category: "execute",
      definition: {
        type: "function",
        function: {
          name: "memory_write",
          description:
            "Persist a durable user/project memory across sessions (Ch3). Use for preferences, facts, procedures. Do not store secrets.",
          parameters: {
            type: "object",
            properties: {
              content: { type: "string", description: "Memory content" },
              kind: {
                type: "string",
                enum: ["preference", "fact", "procedure", "episode"],
                description: "Memory kind",
              },
              tags: {
                type: "string",
                description: "Comma-separated tags",
              },
            },
            required: ["content"],
          },
        },
      },
      handler: (args, ctx) => {
        const content = parseArgsObject(args, "content");
        if (!content) return JSON.stringify({ ok: false, error: "content required" });
        try {
          const { item, total } = writeMemory(ctx.workspaceRoot, {
            content,
            kind: parseArgsObject(args, "kind", "fact") || "fact",
            tags: parseArgsObject(args, "tags", ""),
            source: ctx.agentId,
          });
          return JSON.stringify({ ok: true, id: item.id, total });
        } catch (e) {
          return JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      },
    },
    {
      category: "perceive",
      definition: {
        type: "function",
        function: {
          name: "memory_search",
          description:
            "Search durable memories by keyword (simple lexical recall / RAG-lite for user memory).",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Keyword query" },
              limit: { type: "number", description: "Max results (default 10)" },
            },
            required: ["query"],
          },
        },
      },
      handler: (args, ctx) => {
        const query = parseArgsObject(args, "query").toLowerCase();
        const limit =
          typeof args.limit === "number" && args.limit > 0
            ? Math.min(args.limit, 50)
            : 10;
        const items = loadMemories(ctx.workspaceRoot);
        if (!query) {
          return JSON.stringify({
            ok: true,
            results: items.slice(-limit).reverse(),
          });
        }
        const scored = items
          .map((m) => {
            const hay = `${m.content} ${m.tags.join(" ")} ${m.kind}`.toLowerCase();
            const hit = hay.includes(query) ? 2 : 0;
            const partial = query
              .split(/\s+/)
              .filter((w) => w.length > 1 && hay.includes(w)).length;
            return { m, score: hit + partial };
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map((x) => x.m);
        return JSON.stringify({ ok: true, count: scored.length, results: scored });
      },
    },
  ];
}

/** Format top memories for system context injection (Ch3 progressive). */
export function formatMemoriesForContext(
  workspaceRoot: string,
  limit = 12,
): string {
  const items = loadMemories(workspaceRoot).slice(-limit);
  if (!items.length) return "";
  const lines = items.map(
    (m) => `- [${m.kind}] ${m.content}${m.tags.length ? ` #${m.tags.join(",")}` : ""}`,
  );
  return `## 用户/项目记忆（跨会话）\n${lines.join("\n")}`;
}

/**
 * C3-02 light: after a successful run that wrote files or created workflow tasks,
 * append one short episode memory. Silent on skip/failure; no secrets; max 200 chars.
 */
export function maybeDistillEpisode(
  workspaceRoot: string,
  opts: {
    toolsUsed: string[];
    prompt: string;
    agentId?: string;
    success?: boolean;
  },
): void {
  try {
    if (opts.success === false) return;
    const tools = opts.toolsUsed || [];
    if (!tools.some((t) => DISTILL_TRIGGER_TOOLS.has(t))) return;

    const unique = [...new Set(tools)].slice(0, 8).join(",");
    const promptSlice = (opts.prompt || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    let content = `ran tools ${unique} for: ${promptSlice}`;
    content = redactSecrets(content).slice(0, 200).trim();
    if (!content) return;

    writeMemory(workspaceRoot, {
      content,
      kind: "episode",
      tags: ["trajectory-distill"],
      source: opts.agentId || "trajectory-distill",
    });
  } catch {
    /* silent failure */
  }
}
