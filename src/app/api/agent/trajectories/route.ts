import path from "node:path";
import {
  listTrajectoryIndex,
  summarizeTrajectories,
  writeLessonsSkill,
  lessonsSkillId,
} from "@/lib/agent/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveWorkspace(bodyCwd?: string): string {
  if (bodyCwd?.trim()) return path.resolve(bodyCwd.trim());
  if (process.env.YXT_WORKSPACE_ROOT?.trim()) {
    return path.resolve(process.env.YXT_WORKSPACE_ROOT.trim());
  }
  return path.resolve(process.cwd(), "workspace");
}

/** GET - last 20 trajectories + aggregate summary. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd") || undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(
    100,
    Math.max(1, limitRaw ? Number(limitRaw) || 20 : 20),
  );
  const workspaceRoot = resolveWorkspace(cwd);

  const items = listTrajectoryIndex(workspaceRoot, limit);
  const summary = summarizeTrajectories(workspaceRoot);

  return Response.json({
    ok: true,
    workspaceRoot,
    limit,
    items,
    summary: {
      total: summary.total,
      successRate: summary.successRate,
      topTools: summary.topTools,
      failureCount: summary.failures.length,
      failures: summary.failures.slice(0, 10),
    },
  });
}

type PostBody = {
  action?: string;
  cwd?: string;
};

/**
 * POST - offline evolution actions.
 * { "action": "harvest" } -> write lessons-from-runs skill, return path.
 */
export async function POST(req: Request) {
  let body: PostBody = {};
  try {
    body = (await req.json()) as PostBody;
  } catch {
    body = {};
  }

  const action = (body.action || "").trim();
  const workspaceRoot = resolveWorkspace(body.cwd);

  if (action === "harvest") {
    const skillPath = writeLessonsSkill(workspaceRoot);
    return Response.json({
      ok: true,
      action: "harvest",
      skillId: lessonsSkillId(),
      path: skillPath,
      workspaceRoot,
    });
  }

  if (action === "summarize") {
    const summary = summarizeTrajectories(workspaceRoot);
    return Response.json({ ok: true, action: "summarize", summary, workspaceRoot });
  }

  return Response.json(
    {
      ok: false,
      error: "unknown action",
      supported: ["harvest", "summarize"],
    },
    { status: 400 },
  );
}
