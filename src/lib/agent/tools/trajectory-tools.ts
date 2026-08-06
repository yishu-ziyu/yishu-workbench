/**
 * Trajectory GC tool (Ch8 observability hygiene).
 * dangerous=true; blocked unless ctx.state.allowDangerous.
 * Keeps the newest N trajectory .json files by mtime; does not rewrite index.jsonl.
 */
import fs from "node:fs";
import path from "node:path";
import type { ToolSpec } from "../types";
import { trajectoriesDir } from "../paths";

const DEFAULT_KEEP = 50;

export type TrajectoryGcResult = {
  ok: boolean;
  dir: string;
  keep: number;
  total: number;
  kept: number;
  deleted: number;
  deletedFiles: string[];
  error?: string;
};

/** Keep last N trajectory .json by mtime; delete older ones. Does not touch index.jsonl. */
export function runTrajectoryGc(
  workspaceRoot: string,
  keep = DEFAULT_KEEP,
): TrajectoryGcResult {
  const n = Number.isFinite(keep) && keep >= 0 ? Math.floor(keep) : DEFAULT_KEEP;
  const dir = trajectoriesDir(workspaceRoot);
  if (!fs.existsSync(dir)) {
    return {
      ok: true,
      dir,
      keep: n,
      total: 0,
      kept: 0,
      deleted: 0,
      deletedFiles: [],
    };
  }

  const entries: Array<{ name: string; full: string; mtimeMs: number }> = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const full = path.join(dir, name);
    try {
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      entries.push({ name, full, mtimeMs: st.mtimeMs });
    } catch {
      /* skip unreadable */
    }
  }

  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const toKeep = entries.slice(0, n);
  const toDelete = entries.slice(n);
  const deletedFiles: string[] = [];

  for (const e of toDelete) {
    fs.unlinkSync(e.full);
    deletedFiles.push(e.name);
  }

  return {
    ok: true,
    dir,
    keep: n,
    total: entries.length,
    kept: toKeep.length,
    deleted: deletedFiles.length,
    deletedFiles,
  };
}

export function createTrajectoryTools(): ToolSpec[] {
  return [
    {
      category: "execute",
      dangerous: true,
      definition: {
        type: "function",
        function: {
          name: "trajectory_gc",
          description:
            "Garbage-collect old trajectory JSON files under workspace/.agent/trajectories. Keeps the newest N files by mtime (default 50) and deletes older .json only. Does not rewrite index.jsonl. Dangerous: requires allowDangerous.",
          parameters: {
            type: "object",
            properties: {
              keep: {
                type: "number",
                description: `How many newest trajectory .json files to keep (default ${DEFAULT_KEEP})`,
              },
            },
          },
        },
      },
      handler: (args, ctx) => {
        const raw = args.keep;
        let keep = DEFAULT_KEEP;
        if (typeof raw === "number" && Number.isFinite(raw)) {
          keep = raw;
        } else if (typeof raw === "string" && raw.trim() !== "") {
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) keep = parsed;
        }
        const result = runTrajectoryGc(ctx.workspaceRoot, keep);
        return JSON.stringify(result);
      },
    },
  ];
}
