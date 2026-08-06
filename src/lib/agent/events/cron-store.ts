import fs from "node:fs";
import path from "node:path";
import { agentRoot } from "../paths";

/** Disk cron job (workspace/.agent/crons.json). */
export type CronJob = {
  id: string;
  name: string;
  schedule: string;
  agentId: string;
  prompt: string;
  enabled: boolean;
  lastRun?: string;
};

export type CronLogEntry = {
  at: string;
  cronId: string;
  name: string;
  schedule: string;
  agentId: string;
  /** ok | error | dry_run (tick without YXT_CRON_EXECUTE) */
  status: "ok" | "error" | "dry_run";
  error?: string;
};

export function cronsPath(workspaceRoot: string): string {
  return path.join(agentRoot(workspaceRoot), "crons.json");
}

export function cronLogPath(workspaceRoot: string): string {
  return path.join(agentRoot(workspaceRoot), "cron-log.jsonl");
}

function ensureAgentDir(workspaceRoot: string): void {
  fs.mkdirSync(agentRoot(workspaceRoot), { recursive: true });
}

function normalizeJob(raw: Partial<CronJob> & { id?: string }): CronJob | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const schedule = typeof raw.schedule === "string" ? raw.schedule.trim() : "";
  const agentId =
    typeof raw.agentId === "string" && raw.agentId.trim()
      ? raw.agentId.trim()
      : "momo";
  const prompt = typeof raw.prompt === "string" ? raw.prompt : "";
  if (!id || !name || !schedule) return null;
  const job: CronJob = {
    id,
    name,
    schedule,
    agentId,
    prompt,
    enabled: raw.enabled !== false,
  };
  if (typeof raw.lastRun === "string" && raw.lastRun.trim()) {
    job.lastRun = raw.lastRun.trim();
  }
  return job;
}

/** Load crons from disk; missing/invalid file → []. */
export function loadCrons(workspaceRoot: string): CronJob[] {
  const p = cronsPath(workspaceRoot);
  if (!fs.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as unknown;
    const list = Array.isArray(raw)
      ? raw
      : raw &&
          typeof raw === "object" &&
          Array.isArray((raw as { crons?: unknown }).crons)
        ? (raw as { crons: unknown[] }).crons
        : [];
    const out: CronJob[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const job = normalizeJob(item as Partial<CronJob>);
      if (job) out.push(job);
    }
    return out;
  } catch {
    return [];
  }
}

/** Persist full cron list (atomic-ish write). */
export function saveCrons(workspaceRoot: string, crons: CronJob[]): void {
  ensureAgentDir(workspaceRoot);
  const p = cronsPath(workspaceRoot);
  const cleaned = crons
    .map((c) => normalizeJob(c))
    .filter((c): c is CronJob => !!c);
  fs.writeFileSync(p, JSON.stringify(cleaned, null, 2) + "\n", "utf8");
}

export function listCrons(workspaceRoot: string): CronJob[] {
  return loadCrons(workspaceRoot);
}

/**
 * Insert or update by id. If id missing, generates cron-<timestamp>.
 * Returns the saved job.
 */
export function upsertCron(
  workspaceRoot: string,
  input: Partial<CronJob> & {
    name?: string;
    schedule?: string;
    agentId?: string;
    prompt?: string;
  },
): CronJob {
  const list = loadCrons(workspaceRoot);
  const id =
    (typeof input.id === "string" && input.id.trim()) ||
    `cron-${Date.now().toString(36)}`;
  const existing = list.find((c) => c.id === id);
  const merged: CronJob = {
    id,
    name: (input.name ?? existing?.name ?? "").trim() || "unnamed",
    schedule:
      (input.schedule ?? existing?.schedule ?? "").trim() || "@daily",
    agentId:
      (input.agentId ?? existing?.agentId ?? "momo").trim() || "momo",
    prompt: input.prompt ?? existing?.prompt ?? "",
    enabled:
      input.enabled !== undefined
        ? input.enabled !== false
        : existing
          ? existing.enabled
          : true,
  };
  if (input.lastRun !== undefined) {
    if (input.lastRun) merged.lastRun = input.lastRun;
  } else if (existing?.lastRun) {
    merged.lastRun = existing.lastRun;
  }

  const next = list.filter((c) => c.id !== id);
  next.push(merged);
  // stable order: keep previous order, append new
  if (existing) {
    const ordered = list.map((c) => (c.id === id ? merged : c));
    saveCrons(workspaceRoot, ordered);
  } else {
    saveCrons(workspaceRoot, next);
  }
  return merged;
}

/** Remove by id. Returns true if something was removed. */
export function removeCron(workspaceRoot: string, id: string): boolean {
  const list = loadCrons(workspaceRoot);
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) return false;
  saveCrons(workspaceRoot, next);
  return true;
}

/** Append one JSON line to workspace/.agent/cron-log.jsonl */
export function appendCronLog(
  workspaceRoot: string,
  entry: CronLogEntry,
): void {
  ensureAgentDir(workspaceRoot);
  const p = cronLogPath(workspaceRoot);
  fs.appendFileSync(p, JSON.stringify(entry) + "\n", "utf8");
}
