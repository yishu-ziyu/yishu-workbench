import fs from "node:fs";
import path from "node:path";
import type { ToolSpec } from "../types";
import { agentRoot } from "../paths";
import { parseArgsObject } from "./registry";
import { BUSINESS_AGENT_IDS, isBusinessAgentId } from "../agents";

export type DiskInboxItem = {
  id: string;
  title: string;
  body: string;
  kind: "approval" | "mention" | "system";
  done: boolean;
  createdAt: string;
};

function inboxPath(workspaceRoot: string): string {
  return path.join(agentRoot(workspaceRoot), "inbox.json");
}

export function loadInbox(workspaceRoot: string): DiskInboxItem[] {
  const p = inboxPath(workspaceRoot);
  if (!fs.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as DiskInboxItem[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveInbox(workspaceRoot: string, items: DiskInboxItem[]): void {
  const p = inboxPath(workspaceRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(items.slice(0, 200), null, 2), "utf8");
}

export type PushInboxInput = {
  title: string;
  body: string;
  kind?: DiskInboxItem["kind"];
};

/** Push one inbox item (disk SSOT under workspace/.agent/inbox.json). */
export function pushInbox(
  workspaceRoot: string,
  input: PushInboxInput,
): DiskInboxItem {
  const kind = input.kind || "approval";
  const item: DiskInboxItem = {
    id: `in-${Date.now()}`,
    title: input.title,
    body: input.body,
    kind: ["approval", "mention", "system"].includes(kind) ? kind : "system",
    done: false,
    createdAt: new Date().toISOString(),
  };
  const items = loadInbox(workspaceRoot);
  items.unshift(item);
  saveInbox(workspaceRoot, items);
  return item;
}

/** Mark inbox item done (disk SSOT under workspace/.agent/inbox.json). */
export function markInboxDone(
  workspaceRoot: string,
  id: string,
  done = true,
): { item: DiskInboxItem | null; items: DiskInboxItem[] } {
  const items = loadInbox(workspaceRoot);
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) {
    return { item: null, items };
  }
  items[idx] = { ...items[idx], done };
  saveInbox(workspaceRoot, items);
  return { item: items[idx], items };
}

export function createCollabTools(): ToolSpec[] {
  return [
    {
      category: "user_comm",
      definition: {
        type: "function",
        function: {
          name: "inbox_push",
          description:
            "Push a notification/approval request to the human inbox (Ch4 user communication tool). Use at human gates: PM 评审, Owner 审批, 已交付确认.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              body: { type: "string" },
              kind: {
                type: "string",
                enum: ["approval", "mention", "system"],
              },
            },
            required: ["title", "body"],
          },
        },
      },
      handler: (args, ctx) => {
        const title = parseArgsObject(args, "title");
        const body = parseArgsObject(args, "body");
        if (!title || !body) {
          return JSON.stringify({ ok: false, error: "title and body required" });
        }
        const kind = (parseArgsObject(args, "kind", "approval") ||
          "approval") as DiskInboxItem["kind"];
        const item = pushInbox(ctx.workspaceRoot, { title, body, kind });
        return JSON.stringify({ ok: true, item });
      },
    },
    {
      category: "collaborate",
      definition: {
        type: "function",
        function: {
          name: "handoff_to_agent",
          description:
            "Hand off work to another specialist agent with an explicit brief (Ch10 isolated-context handoff). Does not share full history — only the brief you write. Agents: prd-writer, prd-reviewer, delivery, momo.",
          parameters: {
            type: "object",
            properties: {
              targetAgentId: {
                type: "string",
                enum: ["momo", "prd-writer", "prd-reviewer", "delivery"],
              },
              brief: {
                type: "string",
                description: "Self-contained task brief for the target agent",
              },
              artifactPaths: {
                type: "string",
                description: "Comma-separated workspace paths the target should read",
              },
            },
            required: ["targetAgentId", "brief"],
          },
        },
      },
      handler: (args, ctx) => {
        const target = parseArgsObject(args, "targetAgentId");
        const brief = parseArgsObject(args, "brief");
        if (!target || !brief) {
          return JSON.stringify({ ok: false, error: "targetAgentId and brief required" });
        }
        const allowed = new Set(["momo", "prd-writer", "prd-reviewer", "delivery"]);
        if (!allowed.has(target)) {
          return JSON.stringify({
            ok: false,
            error: `unknown targetAgentId: ${target}`,
            allowed: [...allowed],
          });
        }
        if (target === ctx.agentId) {
          return JSON.stringify({
            ok: false,
            error: "cannot handoff to self",
          });
        }
        if (brief.trim().length < 12) {
          return JSON.stringify({
            ok: false,
            error: "brief too short (<12 chars); handoff must be self-contained",
          });
        }
        const paths = parseArgsObject(args, "artifactPaths", "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const handoff = {
          id: `ho-${Date.now()}`,
          from: ctx.agentId,
          to: target,
          brief,
          artifactPaths: paths,
          createdAt: new Date().toISOString(),
          conversationId: ctx.conversationId,
        };
        const dir = path.join(agentRoot(ctx.workspaceRoot), "handoffs");
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${handoff.id}.json`);
        fs.writeFileSync(file, JSON.stringify(handoff, null, 2), "utf8");
        // Also queue for multi-agent runner
        const queue = (ctx.state.handoffQueue as unknown[]) || [];
        queue.push(handoff);
        ctx.state.handoffQueue = queue;
        return JSON.stringify({
          ok: true,
          handoff,
          note: "Handoff recorded. Multi-agent runner may execute target next.",
        });
      },
    },
    {
      category: "collaborate",
      definition: {
        type: "function",
        function: {
          name: "transfer_role",
          description:
            "Switch your specialist role mid-run while keeping the full shared conversation history (Ch10 shared-context multi-stage). Prefer this over handoff when the same thread should continue as another role (e.g. writer → reviewer). Agents: prd-writer, prd-reviewer, delivery, momo.",
          parameters: {
            type: "object",
            properties: {
              roleId: {
                type: "string",
                enum: [...BUSINESS_AGENT_IDS],
              },
              reason: {
                type: "string",
                description: "Why this role switch is needed (shown to the model after transfer)",
              },
            },
            required: ["roleId", "reason"],
          },
        },
      },
      handler: (args, ctx) => {
        const roleId = parseArgsObject(args, "roleId");
        const reason = parseArgsObject(args, "reason");
        if (!roleId || !reason?.trim()) {
          return JSON.stringify({
            ok: false,
            error: "roleId and reason required",
          });
        }
        if (!isBusinessAgentId(roleId)) {
          return JSON.stringify({
            ok: false,
            error: `unknown roleId: ${roleId}`,
            allowed: [...BUSINESS_AGENT_IDS],
          });
        }
        ctx.state.pendingRoleTransfer = {
          roleId,
          reason: reason.trim(),
        };
        return JSON.stringify({
          ok: true,
          roleId,
          reason: reason.trim(),
          note: "Role transfer queued; loop will switch identity and continue with shared history.",
        });
      },
    },
    {
      category: "perceive",
      definition: {
        type: "function",
        function: {
          name: "get_status_bar",
          description:
            "Read current Agent status bar: time, cwd, agent id, open task counts (Ch2 status bar / system hint).",
          parameters: { type: "object", properties: {} },
        },
      },
      handler: (_args, ctx) => {
        return JSON.stringify({
          ok: true,
          status: buildStatusBar(ctx.workspaceRoot, ctx.agentId, ctx.agentRole),
        });
      },
    },
  ];
}

export function buildStatusBar(
  workspaceRoot: string,
  agentId: string,
  agentRole: string,
): string {
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let taskLine = "workflow: n/a";
  try {
    const p = path.join(agentRoot(workspaceRoot), "workflow-state.json");
    if (fs.existsSync(p)) {
      const wf = JSON.parse(fs.readFileSync(p, "utf8")) as {
        tasks?: Array<{ stageId: string; title: string }>;
        stages?: Array<{ id: string; title: string }>;
      };
      const n = wf.tasks?.length ?? 0;
      const byStage = new Map<string, number>();
      for (const t of wf.tasks || []) {
        byStage.set(t.stageId, (byStage.get(t.stageId) || 0) + 1);
      }
      const parts = [...byStage.entries()]
        .map(([id, c]) => `${id}:${c}`)
        .join(" ");
      taskLine = `tasks=${n} ${parts}`;
    }
  } catch {
    /* ignore */
  }
  return [
    `time=${now.toISOString()} tz=${tz}`,
    `agent=${agentId} role=${agentRole}`,
    `workspace=${workspaceRoot}`,
    taskLine,
  ].join(" | ");
}
