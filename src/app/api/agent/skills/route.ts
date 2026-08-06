import path from "node:path";
import {
  ensureBundledSkills,
  listSkillIndex,
  loadSkillBody,
} from "@/lib/agent/skills/loader";

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
 * GET /api/agent/skills
 * Lists skills on disk (workspace/.agent/skills). Ensures bundled skills exist.
 * Query:
 *   - cwd: optional workspace root
 *   - preview=1: include truncated body preview per skill
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd");
  const withPreview =
    url.searchParams.get("preview") === "1" ||
    url.searchParams.get("preview") === "true";
  const workspaceRoot = resolveWorkspace(cwd);

  // Explicit ensure (listSkillIndex also ensures; keep GET contract clear)
  ensureBundledSkills(workspaceRoot);
  const index = listSkillIndex(workspaceRoot);

  const skills = index.map((s) => {
    const item: {
      id: string;
      name: string;
      description: string;
      preview?: string;
    } = {
      id: s.id,
      name: s.name,
      description: s.description,
    };
    if (withPreview) {
      const body = loadSkillBody(workspaceRoot, s.id);
      if (body) {
        const trimmed = body.trim();
        item.preview =
          trimmed.length > 280 ? `${trimmed.slice(0, 280)}…` : trimmed;
      }
    }
    return item;
  });

  return Response.json({
    ok: true,
    workspaceRoot,
    skills,
  });
}
