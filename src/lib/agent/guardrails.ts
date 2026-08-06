/**
 * Harness guardrails (Book Ch1 / Ch4):
 * path sandbox, secret redaction, human gates, tool-arg validation.
 */
import path from "node:path";

/** Resolve relPath under workspaceRoot; block `..` and absolute escape. */
export function assertSafePath(workspaceRoot: string, relPath: string): string {
  if (relPath == null || String(relPath).trim() === "") {
    throw new Error("Path required");
  }
  const raw = String(relPath);
  // Absolute paths (posix or win) must not escape via absolute form
  if (path.isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw)) {
    throw new Error("Absolute path blocked");
  }
  const cleaned = raw.replace(/^\/+/, "").replace(/\\/g, "/");
  if (cleaned.split("/").some((seg) => seg === "..")) {
    throw new Error("Path traversal blocked (..)");
  }
  if (cleaned.includes("..")) {
    throw new Error("Path traversal blocked (..)");
  }
  const rootAbs = path.resolve(workspaceRoot);
  const abs = path.resolve(rootAbs, cleaned);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    throw new Error("Path escapes workspace root");
  }
  return abs;
}

/** Mask common secrets before tool results return to the model. */
export function redactSecrets(text: string): string {
  if (!text) return text;
  let out = text;
  // OpenAI / sk- style keys
  out = out.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-***REDACTED***");
  // Bearer tokens
  out = out.replace(
    /(Bearer\s+)[A-Za-z0-9._\-+/=]{8,}/gi,
    "$1***REDACTED***",
  );
  // api_key / access_token / secret_key assignments
  out = out.replace(
    /((?:api[_-]?key|access[_-]?token|secret[_-]?key|token)\s*[:=]\s*)(["']?)[^\s"',}\\]{8,}\2/gi,
    "$1$2***REDACTED***$2",
  );
  // JWT-looking blobs
  out = out.replace(
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    "***JWT_REDACTED***",
  );
  return out;
}

export type StageLike = { id: string; humanGate?: boolean };

/** True when stage is marked humanGate (HITL required). */
export function shouldRequireHumanGate(
  stageId: string,
  stages: StageLike[],
): boolean {
  if (!stageId || !stages?.length) return false;
  const stage = stages.find((s) => s.id === stageId);
  return Boolean(stage?.humanGate);
}

/** Known default workflow stage ids (soft check for workflow_move_task). */
const KNOWN_STAGE_IDS = new Set([
  "draft",
  "ai-review",
  "pm-review",
  "bdd",
  "owner",
  "dev",
  "shipped",
  "closed",
  "wont",
]);

/**
 * Basic pre-exec arg validation.
 * write_file: path required.
 * workflow_move_task: optional known-stage check when stageId present.
 */
export function validateToolArgs(
  name: string,
  args: Record<string, unknown>,
): { ok: boolean; error?: string } {
  if (name === "write_file" || name === "read_file" || name === "edit_file") {
    const p = args.path;
    if (typeof p !== "string" || !p.trim()) {
      return { ok: false, error: `${name}: path required` };
    }
  }
  if (name === "edit_file") {
    if (typeof args.old_string !== "string" || !args.old_string) {
      return { ok: false, error: "edit_file: old_string required" };
    }
    if (typeof args.new_string !== "string") {
      return { ok: false, error: "edit_file: new_string required" };
    }
  }
  if (name === "workflow_move_task") {
    const taskId = args.taskId;
    if (typeof taskId !== "string" || !taskId.trim()) {
      return { ok: false, error: "workflow_move_task: taskId required" };
    }
    const stageId = args.stageId;
    if (stageId != null && stageId !== "") {
      if (typeof stageId !== "string") {
        return { ok: false, error: "workflow_move_task: stageId must be string" };
      }
      // Optional known-stage existence check
      if (!KNOWN_STAGE_IDS.has(stageId)) {
        return {
          ok: false,
          error: `workflow_move_task: unknown stageId "${stageId}"`,
        };
      }
    }
  }
  if (name === "shell_exec") {
    const cmd = args.command;
    if (typeof cmd !== "string" || !cmd.trim()) {
      return { ok: false, error: "shell_exec: command required" };
    }
  }
  return { ok: true };
}
