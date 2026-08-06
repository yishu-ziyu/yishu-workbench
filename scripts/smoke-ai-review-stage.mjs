/**
 * Live smoke: AI review stage (prd-reviewer).
 * 1) env + minimax
 * 2) find/create a draft task (code, not LLM)
 * 3) runAgentOnce as prd-reviewer on 通知中心 PRD
 * 4) PASS if tools include read_file|load_skill and finalText has 通过|打回|条件
 *
 * Run: node scripts/smoke-ai-review-stage.mjs
 * Exit: 0 pass/skip, 1 crash, 2 LLM/agent fail
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const workspace = path.join(root, "workspace");
const PRD_REL = "General/PRD - Spec 评审/通知中心重设计-prd.md";

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return 0;
  let n = 0;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    let t = line.trim();
    if (!t || t.startsWith("#")) continue;
    if (t.startsWith("export ")) t = t.slice(7).trim();
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) {
      process.env[k] = v;
      n++;
    }
  }
  return n;
}

function snippet(text, n = 400) {
  const s = (text || "").replace(/\s+/g, " ").trim();
  return s.length <= n ? s : s.slice(0, n) + "…";
}

const envPath = path.join(
  process.env.HOME || "",
  ".config/ai-providers/env.local",
);
const loaded = loadEnvFile(envPath);
console.log(`env: loaded ${loaded} keys from ai-providers/env.local`);

// Prefer minimax for smoke (stepfun often quota'd)
if (!process.env.YXT_LLM_PREFER) process.env.YXT_LLM_PREFER = "grok";

let jiti;
try {
  jiti = (await import("jiti")).default;
} catch (e) {
  console.error("jiti missing:", e.message);
  process.exit(1);
}
const load = jiti(import.meta.url, { interopDefault: true, esmResolve: true });

try {
  const { resolveAutoProvider } = load(
    path.join(root, "src/lib/agent/providers/openai-compat.ts"),
  );
  const { runAgentOnce } = load(path.join(root, "src/lib/agent/loop.ts"));
  const { BUSINESS_AGENTS } = load(
    path.join(root, "src/lib/agent/multi/orchestrator.ts"),
  );
  const { loadWorkflow, saveWorkflow } = load(
    path.join(root, "src/lib/agent/tools/workflow-tools.ts"),
  );

  const auto = resolveAutoProvider();
  if (!auto.provider) {
    console.log("SKIP no key");
    process.exit(0);
  }
  console.log(
    `provider: ${auto.provider.id} (${auto.reason}) model=${auto.model}`,
  );
  console.log(`prefer: ${process.env.YXT_LLM_PREFER}`);
  console.log(`prd: ${PRD_REL}`);

  // --- find or create a draft task (code, not LLM) ---
  const wf = loadWorkflow(workspace);
  let task =
    wf.tasks.find(
      (t) =>
        t.stageId === "draft" &&
        (t.title.includes("通知中心") || t.title.includes("PRD")),
    ) || wf.tasks.find((t) => t.stageId === "draft");

  if (!task) {
    task = {
      id: `t-smoke-ai-review-${Date.now()}`,
      number: wf.tasks.length + 1,
      title: "通知中心重设计 PRD · smoke ai-review",
      excerpt: "smoke: draft task for prd-reviewer stage",
      stageId: "draft",
      priority: "high",
      assigneeId: "prd-reviewer",
      updatedAt: new Date().toISOString(),
    };
    wf.tasks.push(task);
    saveWorkflow(workspace, wf);
    console.log(`task: created draft ${task.id}`);
  } else {
    console.log(
      `task: reuse draft ${task.id} stage=${task.stageId} title=${task.title}`,
    );
  }

  const taskId = task.id;
  const prompt = [
    `读取「${PRD_REL}」，按 prd-review skill 给简短结论（通过/有条件通过/打回）。`,
    `若合适可用 workflow_move_task 把任务 id=${taskId} 移到 ai-review（若已在 ai-review 则不要重复）。`,
  ].join("\n");

  console.log("\n--- prd-reviewer (maxIterations=8) ---");
  console.log("prompt:", snippet(prompt, 240));

  const result = await runAgentOnce(
    {
      prompt,
      agentId: "prd-reviewer",
      agent: BUSINESS_AGENTS["prd-reviewer"],
      cwd: workspace,
      maxIterations: 8,
      provider: "auto",
      conversationId: "smoke-ai-review-stage",
      history: [],
    },
    { provider: auto.provider, model: auto.model },
  );

  const tools = result.toolsUsed || [];
  const finalText = result.finalText || "";
  console.log("toolsUsed:", tools);
  console.log("finalText:", snippet(finalText, 500));

  if (result.trajectory?.success === false) {
    console.error(
      "FAIL  agent run failed:",
      result.trajectory?.error || "unknown",
    );
    process.exit(2);
  }

  const toolOk =
    tools.includes("read_file") || tools.includes("load_skill");
  const verdictOk = /通过|打回|条件/.test(finalText);

  // Optional post-check: stage after run
  const after = loadWorkflow(workspace);
  const afterTask = after.tasks.find((t) => t.id === taskId);
  console.log(
    `task after: ${taskId} stage=${afterTask?.stageId ?? "missing"}`,
  );

  console.log("\n--- checks ---");
  console.log(`tools has read_file|load_skill: ${toolOk}`);
  console.log(`finalText has 通过|打回|条件: ${verdictOk}`);

  if (!toolOk || !verdictOk) {
    console.error(
      "FAIL  ai-review stage:",
      [
        !toolOk && "missing read_file|load_skill",
        !verdictOk && "missing 通过/打回/条件 in finalText",
      ]
        .filter(Boolean)
        .join("; "),
    );
    process.exit(2);
  }

  console.log("PASS  ai-review stage smoke");
  process.exit(0);
} catch (e) {
  console.error("FAIL ", e instanceof Error ? e.message : e);
  process.exit(2);
}
