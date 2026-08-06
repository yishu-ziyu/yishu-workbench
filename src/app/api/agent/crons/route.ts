import path from "node:path";
import {
  listCrons,
  removeCron,
  upsertCron,
  type CronJob,
} from "@/lib/agent/events/cron-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveWorkspace(cwd?: string | null): string {
  if (cwd?.trim()) return path.resolve(cwd.trim());
  if (process.env.YXT_WORKSPACE_ROOT?.trim()) {
    return path.resolve(process.env.YXT_WORKSPACE_ROOT.trim());
  }
  return path.resolve(process.cwd(), "workspace");
}

/**
 * GET /api/agent/crons
 * Disk SSOT list: workspace/.agent/crons.json
 * Query: cwd (optional workspace root)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd");
  const workspaceRoot = resolveWorkspace(cwd);
  const crons = listCrons(workspaceRoot);
  return Response.json({
    ok: true,
    workspaceRoot,
    crons,
  });
}

type PostBody = Partial<CronJob> & {
  action?: string;
  cwd?: string;
};

/**
 * POST /api/agent/crons
 * - upsert: body with name/schedule/agentId/prompt (id optional)
 * - remove: { action: "remove", id }
 */
export async function POST(req: Request) {
  let body: PostBody = {};
  try {
    body = (await req.json()) as PostBody;
  } catch {
    body = {};
  }

  const workspaceRoot = resolveWorkspace(body.cwd);
  const action = (body.action || "upsert").trim();

  if (action === "remove" || action === "delete") {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return Response.json(
        { ok: false, error: "id required for remove" },
        { status: 400 },
      );
    }
    const removed = removeCron(workspaceRoot, id);
    return Response.json({
      ok: true,
      action: "remove",
      removed,
      id,
      crons: listCrons(workspaceRoot),
      workspaceRoot,
    });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const schedule =
    typeof body.schedule === "string" ? body.schedule.trim() : "";
  // Update-only by id may omit name/schedule (upsert merges)
  if (!body.id && (!name || !schedule)) {
    return Response.json(
      { ok: false, error: "name and schedule required for new cron" },
      { status: 400 },
    );
  }

  const job = upsertCron(workspaceRoot, {
    id: body.id,
    name: body.name,
    schedule: body.schedule,
    agentId: body.agentId,
    prompt: body.prompt,
    enabled: body.enabled,
    lastRun: body.lastRun,
  });

  return Response.json({
    ok: true,
    action: "upsert",
    cron: job,
    crons: listCrons(workspaceRoot),
    workspaceRoot,
  });
}
