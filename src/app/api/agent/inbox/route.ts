import path from "node:path";
import {
  loadInbox,
  markInboxDone,
  type DiskInboxItem,
} from "@/lib/agent/tools/collab-tools";

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
 * GET /api/agent/inbox
 * Disk SSOT list: workspace/.agent/inbox.json
 * Query: cwd (optional workspace root)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd");
  const workspaceRoot = resolveWorkspace(cwd);
  const items = loadInbox(workspaceRoot);
  return Response.json({
    ok: true,
    workspaceRoot,
    items,
    inbox: items,
  });
}

type PatchBody = {
  id?: string;
  done?: boolean;
  cwd?: string;
};

/**
 * PATCH /api/agent/inbox
 * Body: { id, done?: true, cwd? } — mark item done (default done=true).
 */
export async function PATCH(req: Request) {
  let body: PatchBody = {};
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    body = {};
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return Response.json(
      { ok: false, error: "id required" },
      { status: 400 },
    );
  }

  const workspaceRoot = resolveWorkspace(body.cwd);
  const done = body.done === false ? false : true;
  const { item, items } = markInboxDone(workspaceRoot, id, done);

  if (!item) {
    return Response.json(
      {
        ok: false,
        error: "inbox item not found",
        id,
        items,
        workspaceRoot,
      },
      { status: 404 },
    );
  }

  return Response.json({
    ok: true,
    item: item as DiskInboxItem,
    items,
    inbox: items,
    workspaceRoot,
  });
}
