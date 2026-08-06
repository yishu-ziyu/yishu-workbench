/**
 * Ch10 multi-agent acceptance without live LLM.
 * Records handoff_to_agent on disk and optionally drains runMultiAgent with mocks.
 */
import fs from "node:fs";
import path from "node:path";
import { runAgentOnce } from "../loop";
import {
  BUSINESS_AGENTS,
  mockHandoffProvider,
  runMultiAgent,
} from "../multi/orchestrator";
import type { MultiRunResult } from "../multi/orchestrator";
import { createMockProvider } from "../providers/openai-compat";
import { agentRoot, defaultWorkspaceRoot } from "../paths";

export type HandoffEvalCheck = {
  name: string;
  pass: boolean;
  detail: string;
};

export type HandoffEvalResult = {
  pass: boolean;
  checks: HandoffEvalCheck[];
  toolsUsed: string[];
  handoffFiles: string[];
  multiHandoffs: number;
  primaryFinal: string;
  multiFinal: string;
};

function listHandoffFiles(workspaceRoot: string): string[] {
  const dir = path.join(agentRoot(workspaceRoot), "handoffs");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f))
    .sort();
}

function readHandoffBrief(file: string): string | null {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      brief?: string;
      to?: string;
    };
    if (typeof raw.brief === "string" && raw.brief.trim()) return raw.brief;
    return null;
  } catch {
    return null;
  }
}

/**
 * Primary path: mock handoff_to_agent → final, assert disk record under .agent/handoffs/.
 * Multi path: runMultiAgent with a mock that covers primary + child finals (no live LLM).
 */
export async function runHandoffEval(
  cwd?: string,
): Promise<HandoffEvalResult> {
  const workspaceRoot = defaultWorkspaceRoot(cwd);
  const checks: HandoffEvalCheck[] = [];
  const handoffsDir = path.join(agentRoot(workspaceRoot), "handoffs");
  fs.mkdirSync(handoffsDir, { recursive: true });

  const before = new Set(listHandoffFiles(workspaceRoot));

  const primaryProvider = createMockProvider([
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

  const primary = await runAgentOnce(
    {
      prompt:
        "请把通知中心 PRD 草稿交接给 prd-reviewer 做结构完整性评审。",
      agentId: "momo",
      agent: BUSINESS_AGENTS.momo,
      conversationId: `eval-handoff-${Date.now()}`,
      maxIterations: 4,
      cwd: workspaceRoot,
      provider: "mock",
    },
    { provider: primaryProvider, model: "mock" },
  );

  const toolsUsed = primary.toolsUsed;
  const hasHandoffTool = toolsUsed.includes("handoff_to_agent");
  checks.push({
    name: "tool:handoff_to_agent",
    pass: hasHandoffTool,
    detail: hasHandoffTool
      ? "used"
      : `missing; used=${toolsUsed.join(",")}`,
  });

  const afterPrimary = listHandoffFiles(workspaceRoot);
  const newFiles = afterPrimary.filter((f) => !before.has(f));
  const diskPass = newFiles.length >= 1;
  checks.push({
    name: "handoff_disk_record",
    pass: diskPass,
    detail: diskPass
      ? `new=${newFiles.map((f) => path.basename(f)).join(",")}`
      : `no new handoff under ${handoffsDir}`,
  });

  let briefPass = false;
  let briefDetail = "no handoff file to read";
  for (const f of newFiles) {
    const brief = readHandoffBrief(f);
    if (brief) {
      briefPass = true;
      briefDetail = `brief=${brief.slice(0, 80)}`;
      break;
    }
  }
  checks.push({
    name: "handoff_brief_present",
    pass: briefPass,
    detail: briefDetail,
  });

  // Multi: shared mock with primary handoff + primary final + child final so child never needs live LLM
  const multiProvider = createMockProvider([
    {
      type: "tool_calls",
      calls: [
        {
          name: "handoff_to_agent",
          arguments: {
            targetAgentId: "prd-reviewer",
            brief: "多 Agent 验收：请评审 PRD 结构",
            artifactPaths: "General/PRD - Spec 评审/workflow.md",
          },
        },
      ],
    },
    {
      type: "final",
      content: "主 Agent 已发起 handoff。",
    },
    {
      type: "final",
      content: "子 Agent 评审结论：结构基本完整（mock）。",
    },
  ]);

  let multiHandoffs = 0;
  let multiFinal = "";
  try {
    const gen = runMultiAgent(
      {
        prompt: "请交接 prd-reviewer 评审 PRD。",
        agentId: "momo",
        conversationId: `eval-multi-${Date.now()}`,
        maxIterations: 4,
        cwd: workspaceRoot,
        provider: "mock",
      },
      { provider: multiProvider, model: "mock", maxHandoffs: 1 },
    );
    let multiResult: MultiRunResult | undefined;
    for (;;) {
      const n = await gen.next();
      if (n.done) {
        multiResult = n.value;
        break;
      }
    }
    if (!multiResult) throw new Error("runMultiAgent ended without result");
    multiHandoffs = multiResult.handoffs.length;
    const multiPrimaryTools = multiResult.primary.toolsUsed;
    multiFinal = [
      multiResult.primary.finalText,
      ...multiResult.handoffs.map((h) => h.result.finalText),
    ].join("\n");

    const multiToolPass = multiPrimaryTools.includes("handoff_to_agent");
    checks.push({
      name: "multi:primary_handoff_tool",
      pass: multiToolPass,
      detail: multiToolPass
        ? "used"
        : `missing; used=${multiPrimaryTools.join(",")}`,
    });
    // Prefer length >= 1 when mock covers child final; hard floor is no crash.
    checks.push({
      name: "multi:handoffs_array",
      pass: multiHandoffs >= 1,
      detail: `handoffs.length=${multiHandoffs}`,
    });
    checks.push({
      name: "multi:no_crash",
      pass: true,
      detail: "runMultiAgent completed",
    });
  } catch (e) {
    checks.push({
      name: "multi:no_crash",
      pass: false,
      detail: e instanceof Error ? e.message : String(e),
    });
    checks.push({
      name: "multi:primary_handoff_tool",
      pass: false,
      detail: "skipped due to crash",
    });
    checks.push({
      name: "multi:handoffs_array",
      pass: false,
      detail: "skipped due to crash",
    });
  }

  // Also exercise exported mockHandoffProvider (smoke that factory still works)
  try {
    const smoke = mockHandoffProvider();
    const r = await smoke.chat({
      model: "mock",
      messages: [{ role: "user", content: "x" }],
    });
    const hasTool =
      !!r.message.tool_calls?.some(
        (t) => t.function.name === "handoff_to_agent",
      );
    checks.push({
      name: "mockHandoffProvider_factory",
      pass: hasTool,
      detail: hasTool ? "returns handoff tool_calls" : "no handoff tool_calls",
    });
  } catch (e) {
    checks.push({
      name: "mockHandoffProvider_factory",
      pass: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  return {
    pass: checks.every((c) => c.pass),
    checks,
    toolsUsed,
    handoffFiles: listHandoffFiles(workspaceRoot),
    multiHandoffs,
    primaryFinal: primary.finalText || "",
    multiFinal,
  };
}

export function formatHandoffEvalReport(r: HandoffEvalResult): string {
  const mark = r.pass ? "PASS" : "FAIL";
  const lines = r.checks.map(
    (c) => `  ${c.pass ? "ok" : "XX"}  ${c.name}: ${c.detail}`,
  );
  return [
    `${mark}  multi-handoff-records  tools=[${r.toolsUsed.join(",")}] handoffs=${r.multiHandoffs}`,
    ...lines,
  ].join("\n");
}
