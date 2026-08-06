import type { EvalCase, EvalResult, LlmProvider } from "../types";
import { EVAL_CASES } from "./cases";
import { heuristicJudge } from "./judge";
import { runAgentOnce } from "../loop";
import { createMockProvider } from "../providers/openai-compat";
import { BUSINESS_AGENTS } from "../multi/orchestrator";
import { defaultWorkspaceRoot } from "../paths";
import fs from "node:fs";
import path from "node:path";

export async function runEvalCase(
  c: EvalCase,
  opts?: { cwd?: string; liveProvider?: LlmProvider; model?: string },
): Promise<EvalResult> {
  const started = Date.now();
  const checks: EvalResult["checks"] = [];
  const workspaceRoot = defaultWorkspaceRoot(opts?.cwd);

  // Seed demo tasks for gate-related mock cases
  if (c.id === "human-gate-inbox" || c.id === "neg-skip-human-gate") {
    const wfPath = path.join(workspaceRoot, ".agent", "workflow-state.json");
    fs.mkdirSync(path.dirname(wfPath), { recursive: true });
    let wf: {
      id: string;
      title: string;
      path: string;
      stages: Array<{ id: string; title: string; humanGate?: boolean }>;
      tasks: Array<Record<string, unknown>>;
    };
    if (fs.existsSync(wfPath)) {
      wf = JSON.parse(fs.readFileSync(wfPath, "utf8"));
    } else {
      wf = {
        id: "prd-spec",
        title: "PRD - Spec 评审",
        path: "x",
        stages: [
          { id: "draft", title: "PRD 起草" },
          { id: "pm-review", title: "PM 评审", humanGate: true },
          { id: "shipped", title: "已交付", humanGate: true },
        ],
        tasks: [],
      };
    }
    let dirty = false;
    if (
      c.id === "neg-skip-human-gate" &&
      !wf.stages.find((s) => s.id === "shipped")
    ) {
      wf.stages.push({ id: "shipped", title: "已交付", humanGate: true });
      dirty = true;
    }
    if (
      c.id === "human-gate-inbox" &&
      !wf.tasks.find((t) => t.id === "t-demo")
    ) {
      wf.tasks.push({
        id: "t-demo",
        number: 99,
        title: "demo",
        excerpt: "demo",
        stageId: "draft",
        priority: "medium",
        assigneeId: "momo",
        updatedAt: new Date().toISOString(),
      });
      dirty = true;
    }
    if (c.id === "neg-skip-human-gate") {
      const short = wf.tasks.find((t) => t.id === "t-short");
      if (!short) {
        wf.tasks.push({
          id: "t-short",
          number: 98,
          title: "short-excerpt",
          excerpt: "short", // <= 10 chars → shipped gate rejects
          stageId: "draft",
          priority: "medium",
          assigneeId: "momo",
          updatedAt: new Date().toISOString(),
        });
        dirty = true;
      } else if ((short.excerpt as string)?.trim().length > 10) {
        short.excerpt = "short";
        dirty = true;
      }
    }
    if (dirty || !fs.existsSync(wfPath)) {
      fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2));
    }
  }

  let provider: LlmProvider | undefined;
  if (c.mockOnly || c.mockScript) {
    if (!c.mockScript?.length) {
      return {
        caseId: c.id,
        name: c.name,
        pass: false,
        checks: [{ name: "mock_script", pass: false, detail: "missing" }],
        finalText: "",
        toolsUsed: [],
        durationMs: Date.now() - started,
        error: "mockOnly case missing mockScript",
        judgeScore: 0,
        judgeNotes: ["missing mockScript"],
      };
    }
    provider = createMockProvider(c.mockScript);
  } else if (opts?.liveProvider) {
    provider = opts.liveProvider;
  }

  try {
    const agent = BUSINESS_AGENTS[c.agentId] || {
      id: c.agentId,
      name: c.agentId,
      role: "agent",
    };
    const result = await runAgentOnce(
      {
        prompt: c.prompt,
        agentId: c.agentId,
        agent,
        maxIterations: c.maxIterations ?? 8,
        cwd: opts?.cwd,
        provider: c.mockOnly ? "mock" : "auto",
      },
      { provider, model: opts?.model || "mock" },
    );

    const toolsUsed = result.toolsUsed;
    const finalText = result.finalText || "";

    if (c.expectTools?.length) {
      for (const t of c.expectTools) {
        const pass = toolsUsed.includes(t);
        checks.push({
          name: `tool:${t}`,
          pass,
          detail: pass ? "used" : `missing; used=${toolsUsed.join(",")}`,
        });
      }
    }
    if (c.expectContains?.length) {
      for (const s of c.expectContains) {
        const pass = finalText.includes(s);
        checks.push({
          name: `contains:${s}`,
          pass,
          detail: pass ? "ok" : "not found in final",
        });
      }
    }
    if (c.forbidContains?.length) {
      for (const s of c.forbidContains) {
        const pass = !finalText.includes(s);
        checks.push({
          name: `forbid:${s}`,
          pass,
          detail: pass ? "ok" : "unexpectedly present",
        });
      }
    }

    if (!checks.length) {
      checks.push({
        name: "completed",
        pass: !!finalText,
        detail: finalText.slice(0, 100),
      });
    }

    const judge = heuristicJudge(finalText, {
      expectContains: c.expectContains,
      forbidContains: c.forbidContains,
      expectTools: c.expectTools,
      toolsUsed,
    });

    const pass = checks.every((x) => x.pass);
    return {
      caseId: c.id,
      name: c.name,
      pass,
      checks,
      finalText,
      toolsUsed,
      durationMs: Date.now() - started,
      judgeScore: judge.score,
      judgeNotes: judge.notes,
    };
  } catch (e) {
    return {
      caseId: c.id,
      name: c.name,
      pass: false,
      checks: [
        {
          name: "exception",
          pass: false,
          detail: e instanceof Error ? e.message : String(e),
        },
      ],
      finalText: "",
      toolsUsed: [],
      durationMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
      judgeScore: 0,
      judgeNotes: ["exception"],
    };
  }
}

export async function runAllEvals(opts?: {
  cwd?: string;
  onlyMock?: boolean;
  liveProvider?: LlmProvider;
  model?: string;
}): Promise<{ results: EvalResult[]; passed: number; failed: number }> {
  const cases = opts?.onlyMock
    ? EVAL_CASES.filter((c) => c.mockOnly)
    : EVAL_CASES;
  const results: EvalResult[] = [];
  for (const c of cases) {
    results.push(await runEvalCase(c, opts));
  }
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  return { results, passed, failed };
}

export function formatEvalReport(results: EvalResult[]): string {
  const lines = results.map((r) => {
    const mark = r.pass ? "PASS" : "FAIL";
    const judge =
      typeof r.judgeScore === "number"
        ? ` judge=${r.judgeScore.toFixed(2)}`
        : "";
    const detail = r.checks
      .filter((c) => !c.pass)
      .map((c) => `    - ${c.name}: ${c.detail}`)
      .join("\n");
    return `${mark}  ${r.caseId}${judge}  (${r.durationMs}ms) tools=[${r.toolsUsed.join(",")}]${detail ? "\n" + detail : ""}`;
  });
  const pass = results.filter((r) => r.pass).length;
  const avgJudge =
    results.length &&
    results.every((r) => typeof r.judgeScore === "number")
      ? (
          results.reduce((s, r) => s + (r.judgeScore ?? 0), 0) / results.length
        ).toFixed(2)
      : null;
  const header = avgJudge
    ? `Eval ${pass}/${results.length} passed  avgJudge=${avgJudge}`
    : `Eval ${pass}/${results.length} passed`;
  return [header, ...lines].join("\n");
}
