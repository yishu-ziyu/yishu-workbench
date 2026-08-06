/**
 * Cron tick loop - process due crons on an interval (outside the Next.js process).
 *
 * Default: dry_run (no agent LLM). Set YXT_CRON_EXECUTE=1 to actually run agents.
 *
 * Env:
 *   CRON_TICK_MS         interval ms (default 60000)
 *   MAX_TICKS            stop after N ticks (default unlimited)
 *   YXT_CRON_EXECUTE     1|true → call runAgentOnce for due jobs
 *   YXT_WORKSPACE_ROOT   workspace root (default <repo>/workspace)
 *   YXT_AI_ENV_FILE      optional env file override
 *
 * Usage:
 *   pnpm cron:tick
 *   node scripts/cron-tick-loop.mjs
 *   CRON_TICK_MS=1 MAX_TICKS=1 node scripts/cron-tick-loop.mjs   # 1-tick self test
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvFile(p) {
  if (!p || !fs.existsSync(p)) return 0;
  let n = 0;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (k && process.env[k] === undefined) {
      process.env[k] = v;
      n++;
    }
  }
  return n;
}

function loadEnv() {
  const candidates = [
    process.env.YXT_AI_ENV_FILE,
    path.join(os.homedir(), ".config/ai-providers/env.local"),
    path.join(root, ".env.local"),
  ].filter(Boolean);
  for (const f of candidates) loadEnvFile(f);
  if (!process.env.YXT_LLM_PREFER) process.env.YXT_LLM_PREFER = "grok";
}

function resolveWorkspace() {
  if (process.env.YXT_WORKSPACE_ROOT?.trim()) {
    return path.resolve(process.env.YXT_WORKSPACE_ROOT.trim());
  }
  return path.resolve(root, "workspace");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parsePositiveInt(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

loadEnv();

const tickMs = parsePositiveInt(process.env.CRON_TICK_MS, 60_000) || 60_000;
const maxTicks = parsePositiveInt(process.env.MAX_TICKS, 0); // 0 = unlimited
const execute =
  process.env.YXT_CRON_EXECUTE === "1" ||
  process.env.YXT_CRON_EXECUTE === "true";
const workspaceRoot = resolveWorkspace();

let jiti;
try {
  jiti = (await import("jiti")).default;
} catch (e) {
  console.error("jiti missing:", e?.message || e);
  process.exit(1);
}
const load = jiti(import.meta.url, { interopDefault: true, esmResolve: true });

const { runDueCrons } = load(
  path.join(root, "src/lib/agent/events/cron-tick.ts"),
);

let runner;
if (execute) {
  const { runAgentOnce } = load(path.join(root, "src/lib/agent/loop.ts"));
  const { BUSINESS_AGENTS } = load(
    path.join(root, "src/lib/agent/multi/orchestrator.ts"),
  );
  runner = async (cron) => {
    const prompt = (cron.prompt || "").trim();
    if (!prompt) throw new Error("cron prompt is empty");
    const agentId = cron.agentId || "momo";
    const agent = BUSINESS_AGENTS[agentId] || {
      id: agentId,
      name: agentId,
      role: "cron",
    };
    await runAgentOnce({
      prompt,
      cwd: workspaceRoot,
      agentId,
      agent,
      conversationId: `cron:${cron.id}`,
      maxIterations: 8,
    });
  };
}

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopping = true;
  process.exit(0);
});

console.log(
  `[cron-tick] start workspace=${workspaceRoot} intervalMs=${tickMs} execute=${execute} maxTicks=${maxTicks || "unlimited"}`,
);

let ticks = 0;
while (!stopping) {
  const result = await runDueCrons(workspaceRoot, runner);
  const dueCount = result.due?.length ?? 0;
  const statuses = (result.ran || [])
    .map((r) => `${r.id}:${r.status}`)
    .join(",") || "-";
  // one line per tick: due count
  console.log(
    `[cron-tick] tick=${ticks + 1} due=${dueCount} statuses=${statuses} now=${result.now}`,
  );

  ticks += 1;
  if (maxTicks > 0 && ticks >= maxTicks) break;
  if (stopping) break;
  await sleep(tickMs);
}

process.exit(0);
