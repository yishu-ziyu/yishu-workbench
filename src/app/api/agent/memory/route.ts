import path from "node:path";
import { loadMemories, writeMemory } from "@/lib/agent/tools/memory-tools";
import type { MemoryItem } from "@/lib/agent/types";

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
 * GET /api/agent/memory
 * Disk SSOT list: workspace/.agent/memory/user-memory.json
 * Query: cwd (optional workspace root)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd");
  const workspaceRoot = resolveWorkspace(cwd);
  const memories = loadMemories(workspaceRoot);
  return Response.json({
    ok: true,
    workspaceRoot,
    memories,
  });
}

type PostBody = {
  content?: string;
  kind?: string;
  tags?: string | string[];
  cwd?: string;
  source?: string;
};

/**
 * POST /api/agent/memory
 * Body: { content, kind?, tags?, source?, cwd? }
 * Writes via writeMemory (same path as memory_write tool).
 */
export async function POST(req: Request) {
  let body: PostBody = {};
  try {
    body = (await req.json()) as PostBody;
  } catch {
    body = {};
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return Response.json(
      { ok: false, error: "content required" },
      { status: 400 },
    );
  }

  const workspaceRoot = resolveWorkspace(body.cwd);
  try {
    const { item, total } = writeMemory(workspaceRoot, {
      content,
      kind: typeof body.kind === "string" ? body.kind : undefined,
      tags: body.tags,
      source: typeof body.source === "string" ? body.source : "api",
    });
    return Response.json({
      ok: true,
      item,
      total,
      memories: loadMemories(workspaceRoot) as MemoryItem[],
      workspaceRoot,
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 400 },
    );
  }
}
