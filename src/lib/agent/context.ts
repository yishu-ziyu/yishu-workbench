import fs from "node:fs";
import path from "node:path";
import type { AgentProfileRuntime, ChatMessage } from "./types";
import { formatMemoriesForContext } from "./tools/memory-tools";
import { formatSkillsIndex } from "./skills/loader";
import { buildStatusBar } from "./tools/collab-tools";

/** In-memory file snippet cache keyed by abs path + mtime (Ch2/Ch5 static-ish prefix). */
const fileSnippetCache = new Map<string, { mtimeMs: number; text: string }>();

/** Read first `maxChars` of a file; cache by mtime. Returns null if missing/unreadable. */
export function readFileSnippet(
  absPath: string,
  maxChars: number,
): string | null {
  try {
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return null;
    const st = fs.statSync(absPath);
    const hit = fileSnippetCache.get(absPath);
    if (hit && hit.mtimeMs === st.mtimeMs) return hit.text;
    const text = fs.readFileSync(absPath, "utf8").slice(0, maxChars);
    fileSnippetCache.set(absPath, { mtimeMs: st.mtimeMs, text });
    return text;
  } catch {
    return null;
  }
}

/**
 * Load project-level instructions for system prompt (Ch2/Ch5).
 * - AGENTS.md from process.cwd() (project root), first 4000 chars
 * - workspace/Hub/agent-capabilities.md, first 2000 chars
 */
export function loadProjectInstructions(workspaceRoot: string): string {
  const sections: string[] = [];

  const agentsPath = path.join(process.cwd(), "AGENTS.md");
  const agents = readFileSnippet(agentsPath, 4000);
  if (agents?.trim()) {
    sections.push(`# 项目指令 (AGENTS.md)\n${agents.trim()}`);
  }

  const capsPath = path.join(workspaceRoot, "Hub", "agent-capabilities.md");
  const caps = readFileSnippet(capsPath, 2000);
  if (caps?.trim()) {
    sections.push(`# 工作台能力约定 (agent-capabilities.md)\n${caps.trim()}`);
  }

  return sections.join("\n\n");
}

/**
 * Static system prefix (Ch2 partial prefix freeze).
 * Pure w.r.t. time: no status bar, no memories - only identity, rules, project
 * instructions, and skills index text already loaded by the caller.
 * Stable across iterations when agent + skills + projectInstr are unchanged.
 */
export function buildStaticSystemPrefix(
  agent: AgentProfileRuntime,
  skillsIndexText: string,
  projectInstructions: string,
  extraSkillHint?: string,
): string {
  const base = `你是「奕枢的工作台」内的 AI 同事。
身份：${agent.name}（id=${agent.id}）
职责：${agent.role}

# 核心公式（必须遵守）
Agent = LLM + 上下文 + 工具。你通过工具感知与改变工作区；不要假装读过未读取的文件。

# 工作方式（ReAct）
1. 需要信息 → 调用感知工具（list/read/search/memory/workflow_get）
2. 需要改状态 → 调用执行工具（write/workflow_*/memory_write）
3. 需要人确认 → inbox_push
4. 需要专家接力 → handoff_to_agent（brief 自包含；隔离上下文）
5. 同线程换角色 → transfer_role（共享历史的多阶段角色转换）
6. 信息足够再给最终中文答复

# 业务边界
- 产品主线：PRD-Spec 九阶段评审与交付
- 文件真相在 workspace/ 与 workspace/.agent/
- 不编造用户未提供的审批结果
- 不输出密钥/token 原文

# 输出
- 工具调用用 API tool_calls，不要用伪 XML
- 最终答复简洁、可执行；引用路径用 workspace 相对路径
${agent.systemExtra ? `\n# 额外角色指令\n${agent.systemExtra}` : ""}
`;

  const parts = [
    base,
    projectInstructions,
    skillsIndexText,
    extraSkillHint || "",
  ]
    .filter((p) => p && p.trim())
    .join("\n\n");
  return parts;
}

/**
 * Dynamic system suffix: recent memories + status bar (time / tasks).
 * Intentionally separate from the static prefix so KV-cache can freeze the
 * identity/rules/skills block while status may refresh later.
 */
export function buildDynamicSystemSuffix(
  workspaceRoot: string,
  agent: AgentProfileRuntime,
): string {
  const status = buildStatusBar(workspaceRoot, agent.id, agent.role);
  const memories = formatMemoriesForContext(workspaceRoot);
  return [memories, `# 状态栏\n${status}`]
    .filter((p) => p && p.trim())
    .join("\n\n");
}

/**
 * Full system prompt = static prefix + dynamic suffix (Ch2 context engineering).
 * Prefer buildStaticSystemPrefix + buildDynamicSystemSuffix when you need freeze.
 */
export function buildSystemPrompt(opts: {
  workspaceRoot: string;
  agent: AgentProfileRuntime;
  extraSkillHint?: string;
}): string {
  const { workspaceRoot, agent } = opts;
  const skills = formatSkillsIndex(workspaceRoot);
  const projectInstr = loadProjectInstructions(workspaceRoot);
  const staticPrefix = buildStaticSystemPrefix(
    agent,
    skills,
    projectInstr,
    opts.extraSkillHint,
  );
  const dynamic = buildDynamicSystemSuffix(workspaceRoot, agent);
  return [staticPrefix, dynamic].filter((p) => p && p.trim()).join("\n\n");
}

/**
 * Assemble initial messages.
 * Static system first (frozen prefix). Optional dynamicSystem is a second
 * system message (status/memories) - kept after static so the identity block
 * stays byte-stable; compression notes may insert further system messages later.
 */
export function assembleMessages(opts: {
  system: string;
  /** Status bar + memories; separate system message after static prefix. */
  dynamicSystem?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  prompt: string;
}): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: opts.system }];
  if (opts.dynamicSystem?.trim()) {
    messages.push({ role: "system", content: opts.dynamicSystem });
  }
  for (const h of opts.history || []) {
    if (!h.content?.trim()) continue;
    messages.push({ role: h.role, content: h.content });
  }
  messages.push({ role: "user", content: opts.prompt });
  return messages;
}

/**
 * Ch2 context compression: drop old tool results, keep recent N turns.
 * Returns new message list (does not mutate input).
 */
export function compressMessages(
  messages: ChatMessage[],
  opts?: { keepRecentTurns?: number; maxToolResultChars?: number },
): ChatMessage[] {
  const keepRecent = opts?.keepRecentTurns ?? 8;
  const maxTool = opts?.maxToolResultChars ?? 2000;

  // Always keep system
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");

  // Truncate large tool results
  const truncated = rest.map((m) => {
    if (m.role === "tool" && m.content && m.content.length > maxTool) {
      return {
        ...m,
        content:
          m.content.slice(0, maxTool) +
          `\n…[truncated ${m.content.length - maxTool} chars]`,
      };
    }
    return m;
  });

  if (truncated.length <= keepRecent * 3) {
    return [...system, ...truncated];
  }

  // Keep first user message + tail
  const firstUserIdx = truncated.findIndex((m) => m.role === "user");
  const head =
    firstUserIdx >= 0 ? truncated.slice(firstUserIdx, firstUserIdx + 1) : [];
  const tail = truncated.slice(-keepRecent * 2);
  const note: ChatMessage = {
    role: "system",
    content: `[context compression] 已省略中间 ${Math.max(0, truncated.length - head.length - tail.length)} 条历史消息；细节以 workspace 文件与 memory 为准。`,
  };
  // Merge system notes into single system if possible — keep as extra system after main
  return [...system, note, ...head, ...tail];
}
