/**
 * Workflow stage transition gates (harness).
 * Hard rules only — soft HITL hints stay in workflow_move_task response.
 */

export type GateStage = { id: string; humanGate?: boolean };

export type GateTask = {
  id?: string;
  excerpt?: string;
  stageId?: string;
  assigneeId?: string;
};

export type GateWorkflow = {
  stages: GateStage[];
};

export type GateResult = { ok: boolean; reason?: string };

/**
 * Whether a task may enter `targetStageId`.
 *
 * Hard rules:
 * a) unknown stage → fail
 * b) `closed` / `wont` always ok
 * c) `shipped` requires task.excerpt length > 10 (proxy for has content)
 */
export function canEnterStage(
  wf: GateWorkflow,
  task: GateTask,
  targetStageId: string,
): GateResult {
  if (!targetStageId || typeof targetStageId !== "string") {
    return { ok: false, reason: "target stageId required" };
  }
  const stages = wf?.stages ?? [];
  const stage = stages.find((s) => s.id === targetStageId);
  if (!stage) {
    return {
      ok: false,
      reason: `unknown stageId "${targetStageId}"`,
    };
  }

  // Terminal abandon/close: always allowed
  if (targetStageId === "closed" || targetStageId === "wont") {
    return { ok: true };
  }

  // Shipped requires non-trivial content
  if (targetStageId === "shipped") {
    const excerpt = (task?.excerpt ?? "").trim();
    if (excerpt.length <= 10) {
      return {
        ok: false,
        reason:
          "cannot move to shipped: task.excerpt must be longer than 10 chars (has content)",
      };
    }
  }

  return { ok: true };
}
