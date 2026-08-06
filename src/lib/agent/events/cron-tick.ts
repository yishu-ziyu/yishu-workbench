import type { CronJob } from "./cron-store";
import {
  appendCronLog,
  loadCrons,
  upsertCron,
} from "./cron-store";

export type CronRunner = (cron: CronJob) => Promise<void>;

export type RunDueResult = {
  now: string;
  due: CronJob[];
  ran: Array<{
    id: string;
    name: string;
    status: "ok" | "error" | "dry_run";
    error?: string;
  }>;
};

/**
 * Parse simple schedule → interval in ms.
 * Supported: @hourly | @daily | every_minutes:N (N>=1)
 * Returns null for unsupported expressions.
 */
export function scheduleIntervalMs(schedule: string): number | null {
  const s = (schedule || "").trim();
  if (s === "@hourly") return 60 * 60 * 1000;
  if (s === "@daily") return 24 * 60 * 60 * 1000;
  const m = /^every_minutes:(\d+)$/i.exec(s);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1) return n * 60 * 1000;
  }
  return null;
}

/**
 * Which crons are due at `now`, based on enabled + schedule + lastRun ISO.
 * Never-run jobs (no lastRun) are due immediately if schedule is valid.
 */
export function dueCrons(now: Date, crons: CronJob[]): CronJob[] {
  const t = now.getTime();
  return crons.filter((c) => {
    if (!c.enabled) return false;
    const interval = scheduleIntervalMs(c.schedule);
    if (interval == null) return false;
    if (!c.lastRun) return true;
    const last = Date.parse(c.lastRun);
    if (Number.isNaN(last)) return true;
    return t - last >= interval;
  });
}

/**
 * Process due crons: call runner (default no-op), always stamp lastRun,
 * always append cron-log.jsonl.
 */
export async function runDueCrons(
  workspaceRoot: string,
  runner?: CronRunner,
): Promise<RunDueResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const crons = loadCrons(workspaceRoot);
  const due = dueCrons(now, crons);
  const ran: RunDueResult["ran"] = [];
  const exec = runner;

  for (const cron of due) {
    let status: "ok" | "error" | "dry_run" = exec ? "ok" : "dry_run";
    let error: string | undefined;
    if (exec) {
      try {
        await exec(cron);
      } catch (e) {
        status = "error";
        error = e instanceof Error ? e.message : String(e);
      }
    }

    upsertCron(workspaceRoot, { ...cron, lastRun: nowIso });
    appendCronLog(workspaceRoot, {
      at: nowIso,
      cronId: cron.id,
      name: cron.name,
      schedule: cron.schedule,
      agentId: cron.agentId,
      status,
      error,
    });
    ran.push({ id: cron.id, name: cron.name, status, error });
  }

  return { now: nowIso, due, ran };
}
