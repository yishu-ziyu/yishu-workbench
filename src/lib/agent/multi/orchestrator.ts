/**
 * Multi-agent orchestration (Ch10): manager + isolated handoff.
 * Business mapping: momo orchestrates; prd-writer / prd-reviewer / delivery specialists.
 * Role registry lives in agents.ts (shared with loop role-transfer; avoid cycle).
 */
import type { AgentEvent, LlmProvider, RunRequest } from "../types";
import { runAgentLoop, type LoopResult } from "../loop";
import { createMockProvider } from "../providers/openai-compat";
import { BUSINESS_AGENTS } from "../agents";

export { BUSINESS_AGENTS };

export type MultiRunResult = {
  primary: LoopResult;
  handoffs: Array<{ target: string; result: LoopResult }>;
};

/**
 * Run primary agent; if it queues handoffs, execute each specialist with isolated context
 * (only brief + optional artifact path list in the prompt — Ch10 no shared full history).
 */
export async function* runMultiAgent(
  req: RunRequest,
  opts?: { provider?: LlmProvider; model?: string; maxHandoffs?: number },
): AsyncGenerator<AgentEvent, MultiRunResult> {
  const agentId = req.agentId || "momo";
  const agent = BUSINESS_AGENTS[agentId] || BUSINESS_AGENTS.momo;

  yield {
    type: "step",
    kind: "think",
    label: "多 Agent 编排启动",
    detail: `primary=${agent.id}`,
  };

  const primaryGen = runAgentLoop(
    { ...req, agent, agentId: agent.id },
    { provider: opts?.provider, model: opts?.model },
  );

  let primary: LoopResult | undefined;
  while (true) {
    const n = await primaryGen.next();
    if (n.done) {
      primary = n.value;
      break;
    }
    yield n.value;
  }
  if (!primary) throw new Error("primary agent failed");

  const queue =
    (primary.trajectory.steps
      .flatMap((s) => s.toolResults || [])
      .map((r) => {
        try {
          return JSON.parse(r.result) as {
            ok?: boolean;
            handoff?: {
              to: string;
              brief: string;
              artifactPaths?: string[];
            };
          };
        } catch {
          return null;
        }
      })
      .filter((x) => x?.handoff?.to && x?.handoff?.brief) as Array<{
      handoff: { to: string; brief: string; artifactPaths?: string[] };
    }>) || [];

  const maxH = opts?.maxHandoffs ?? 3;
  const handoffs: Array<{ target: string; result: LoopResult }> = [];

  for (const item of queue.slice(0, maxH)) {
    const h = item.handoff;
    const target = BUSINESS_AGENTS[h.to];
    if (!target) {
      yield {
        type: "step",
        kind: "log",
        label: `跳过未知 handoff 目标: ${h.to}`,
      };
      continue;
    }
    yield {
      type: "step",
      kind: "mcp",
      label: `Handoff → ${target.name}`,
      detail: h.brief.slice(0, 200),
    };

    const paths = (h.artifactPaths || []).join(", ");
    const specialistPrompt = [
      `【来自 ${agent.id} 的交接 brief】`,
      h.brief,
      paths ? `【请先阅读这些文件】${paths}` : "",
      "完成后给出结论；如需再交接可继续 handoff。",
    ]
      .filter(Boolean)
      .join("\n\n");

    const childReq: RunRequest = {
      prompt: specialistPrompt,
      agentId: target.id,
      agent: target,
      conversationId: `${req.conversationId || "c"}-ho-${target.id}`,
      history: [], // isolated context
      maxIterations: req.maxIterations ?? 10,
      cwd: req.cwd,
      provider: req.provider,
    };

    const childGen = runAgentLoop(childReq, {
      provider: opts?.provider,
      model: opts?.model,
    });
    let childResult: LoopResult | undefined;
    while (true) {
      const n = await childGen.next();
      if (n.done) {
        childResult = n.value;
        break;
      }
      yield n.value;
    }
    if (childResult) {
      handoffs.push({ target: target.id, result: childResult });
      yield {
        type: "token",
        text: `\n\n---\n### ${target.name} 交接结果\n\n${childResult.finalText}\n`,
      };
    }
  }

  const finalCombined = [
    primary.finalText,
    ...handoffs.map(
      (h) => `\n\n---\n### ${h.target}\n\n${h.result.finalText}`,
    ),
  ].join("");

  yield {
    type: "done",
    exitCode: 0,
    finalText: finalCombined,
  };

  return { primary, handoffs };
}

/** Peer proposer-reviewer loop for PRD (Ch10 peer collaboration). */
export async function* runProposerReviewer(
  prdPathOrPrompt: string,
  opts?: { provider?: LlmProvider; model?: string; cwd?: string; rounds?: number },
): AsyncGenerator<AgentEvent, { draft: string; review: string }> {
  const rounds = opts?.rounds ?? 1;
  let draft = "";
  let review = "";

  for (let r = 0; r < rounds; r++) {
    yield {
      type: "step",
      kind: "think",
      label: `对等协作 round ${r + 1}: writer`,
    };
    const writer = runAgentLoop(
      {
        prompt:
          r === 0
            ? `请作为 PRD 撰写员处理：\n${prdPathOrPrompt}`
            : `根据评审意见修改 PRD：\n${review}\n\n原文任务：\n${prdPathOrPrompt}`,
        agent: BUSINESS_AGENTS["prd-writer"],
        agentId: "prd-writer",
        cwd: opts?.cwd,
        maxIterations: 10,
      },
      { provider: opts?.provider, model: opts?.model },
    );
    let wRes: LoopResult | undefined;
    while (true) {
      const n = await writer.next();
      if (n.done) {
        wRes = n.value;
        break;
      }
      yield n.value;
    }
    draft = wRes?.finalText || draft;

    yield {
      type: "step",
      kind: "think",
      label: `对等协作 round ${r + 1}: reviewer`,
    };
    const reviewer = runAgentLoop(
      {
        prompt: `请独立评审以下 PRD 产出（或路径说明）：\n${draft}`,
        agent: BUSINESS_AGENTS["prd-reviewer"],
        agentId: "prd-reviewer",
        cwd: opts?.cwd,
        maxIterations: 10,
      },
      { provider: opts?.provider, model: opts?.model },
    );
    let rRes: LoopResult | undefined;
    while (true) {
      const n = await reviewer.next();
      if (n.done) {
        rRes = n.value;
        break;
      }
      yield n.value;
    }
    review = rRes?.finalText || review;
  }

  const finalText = `## 撰写\n\n${draft}\n\n## 评审\n\n${review}`;
  yield { type: "done", exitCode: 0, finalText };
  return { draft, review };
}

/** Helper for tests: mock multi without network. */
export function mockHandoffProvider(): LlmProvider {
  return createMockProvider([
    {
      type: "tool_calls",
      calls: [
        {
          name: "handoff_to_agent",
          arguments: {
            targetAgentId: "prd-reviewer",
            brief: "请评审通知中心 PRD 草稿结构是否完整",
            artifactPaths: "General/PRD - Spec 评审/workflow.md",
          },
        },
      ],
    },
    {
      type: "final",
      content: "已交接给 PRD 评审员。",
    },
  ]);
}
