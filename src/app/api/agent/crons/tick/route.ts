import path from "node:path";
import { runDueCrons } from "@/lib/agent/events/cron-tick";
import { listCrons, type CronJob } from "@/lib/agent/events/cron-store";
import { runAgentOnce } from "@/lib/agent/loop";
import { BUSINESS_AGENTS } from "@/lib/agent/multi/orchestrator";
import type { AgentProfileRuntime } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveWorkspace(cwd?: string | null): string {
  if (cwd?.trim()) return path.resolve(cwd.trim());
  if (process.env.YXT_WORKSPACE_ROOT?.trim()) {
    return path.resolve(process.env.YXT_WORKSPACE_ROOT.trim());
  }
  return path.resolve(process.cwd(), "workspace");
}

type Body = {
  cwd?: string;
};

/**
 * POST /api/agent/crons/tick
 * Process due crons from disk SSOT.
 * - Always updates lastRun + appends workspace/.agent/cron-log.jsonl
 * - Calls runAgentOnce only when YXT_CRON_EXECUTE=1 (safe default: dry_run)
 */
export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const workspaceRoot = resolveWorkspace(body.cwd);
  const execute =
    process.env.YXT_CRON_EXECUTE === "1" ||
    process.env.YXT_CRON_EXECUTE === "true";

  const runner = execute
    ? async (cron: CronJob) => {
        const prompt = (cron.prompt || "").trim();
        if (!prompt) {
          throw new Error("cron prompt is empty");
        }
        const agentId = cron.agentId || "momo";
        const agent: AgentProfileRuntime =
          BUSINESS_AGENTS[agentId] || {
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
      }
    : undefined;

  const result = await runDueCrons(workspaceRoot, runner);

  return Response.json({
    ok: true,
    workspaceRoot,
    execute,
    now: result.now,
    dueCount: result.due.length,
    ran: result.ran,
    crons: listCrons(workspaceRoot),
  });
}
