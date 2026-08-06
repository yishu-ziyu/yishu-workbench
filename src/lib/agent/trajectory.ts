import fs from "node:fs";
import path from "node:path";
import type { LearningSignal, Trajectory, TrajectoryStep } from "./types";
import { trajectoriesDir } from "./paths";

export function createTrajectory(opts: {
  conversationId: string;
  agentId: string;
  prompt: string;
}): Trajectory {
  return {
    id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    conversationId: opts.conversationId,
    agentId: opts.agentId,
    prompt: opts.prompt,
    startedAt: new Date().toISOString(),
    steps: [],
  };
}

export function appendStep(tr: Trajectory, step: TrajectoryStep): void {
  tr.steps.push(step);
}

export function finalizeTrajectory(
  tr: Trajectory,
  opts: {
    finalText: string;
    success: boolean;
    error?: string;
    learningSignals?: LearningSignal[];
  },
): Trajectory {
  tr.endedAt = new Date().toISOString();
  tr.finalText = opts.finalText;
  tr.success = opts.success;
  tr.error = opts.error;
  tr.learningSignals = opts.learningSignals ?? deriveSignals(tr, opts);
  return tr;
}

/** Ch8: derive simple learning signals from trajectory structure. */
export function deriveSignals(
  tr: Trajectory,
  opts: { finalText: string; success: boolean; error?: string },
): LearningSignal[] {
  const signals: LearningSignal[] = [];
  const toolNames = new Set<string>();
  for (const s of tr.steps) {
    for (const c of s.toolCalls || []) {
      toolNames.add(c.function.name);
    }
  }

  signals.push({
    kind: "env_result",
    label: opts.success ? "run_success" : "run_fail",
    score: opts.success ? 1 : 0,
    note: opts.error || `tools=${[...toolNames].join(",")}`,
  });

  if (toolNames.has("read_file") || toolNames.has("search_workspace")) {
    signals.push({
      kind: "process_rule",
      label: "used_perception_tools",
      score: 1,
      note: "Agent grounded in workspace",
    });
  } else if (tr.prompt.length > 40) {
    signals.push({
      kind: "process_rule",
      label: "no_perception_tools",
      score: 0.3,
      note: "Long prompt but no read/search — may hallucinate docs",
    });
  }

  if (toolNames.has("handoff_to_agent")) {
    signals.push({
      kind: "process_rule",
      label: "multi_agent_handoff",
      score: 1,
      note: "Delegated via handoff",
    });
  }

  if (!opts.finalText?.trim() && opts.success) {
    signals.push({
      kind: "llm_rubric",
      label: "empty_final",
      score: 0,
      note: "Success flag but empty final text",
    });
  }

  return signals;
}

export function persistTrajectory(
  workspaceRoot: string,
  tr: Trajectory,
): string {
  const dir = trajectoriesDir(workspaceRoot);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${tr.id}.json`);
  fs.writeFileSync(file, JSON.stringify(tr, null, 2), "utf8");
  // append index line
  const index = path.join(dir, "index.jsonl");
  fs.appendFileSync(
    index,
    JSON.stringify({
      id: tr.id,
      agentId: tr.agentId,
      success: tr.success,
      endedAt: tr.endedAt,
      tools: tr.steps.flatMap((s) =>
        (s.toolCalls || []).map((c) => c.function.name),
      ),
    }) + "\n",
    "utf8",
  );
  return file;
}

/** Ch8: harvest process rules from failed trajectories into a skill draft. */
export function harvestSkillDraft(workspaceRoot: string): string {
  const dir = trajectoriesDir(workspaceRoot);
  if (!fs.existsSync(dir)) return "";
  const fails: string[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json") || f === "index.json") continue;
    try {
      const tr = JSON.parse(
        fs.readFileSync(path.join(dir, f), "utf8"),
      ) as Trajectory;
      if (tr.success === false) {
        fails.push(
          `- run ${tr.id}: ${tr.error || "fail"} | prompt=${tr.prompt.slice(0, 80)}`,
        );
      }
    } catch {
      /* ignore */
    }
  }
  if (!fails.length) return "";
  return `# Auto-harvested lessons\n\n${fails.slice(-20).join("\n")}\n`;
}
