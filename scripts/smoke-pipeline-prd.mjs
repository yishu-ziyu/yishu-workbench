/**
 * Live smoke: full PRD pipeline (momo → prd-writer → prd-reviewer).
 * 1) env minimax
 * 2) momo: confirm 4 items + create_task "管道验收 PRD" → draft
 * 3) prd-writer: short PRD under General/PRD - Spec 评审/
 * 4) prd-reviewer: read + 结论：
 * PASS if create happened OR file written OR conclusion present.
 *
 * Run: node scripts/smoke-pipeline-prd.mjs
 * Exit: 0 pass/skip, 1 crash, 2 LLM/agent fail
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const workspace = path.join(root, "workspace");
const PRD_DIR = "General/PRD - Spec 评审";
const PRD_REL = `${PRD_DIR}/管道验收-prd.md`;
const TASK_TITLE = "管道验收 PRD";

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

function listPrdFiles() {
  const abs = path.join(workspace, PRD_DIR);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => f.endsWith(".md") && f !== "workflow.md")
    .map((f) => path.join(PRD_DIR, f));
}

const envPath = path.join(
  process.env.HOME || "",
  ".config/ai-providers/env.local",
);
const loaded = loadEnvFile(envPath);
console.log(`env: loaded ${loaded} keys from ai-providers/env.local`);

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
  const { loadWorkflow } = load(
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
  console.log(`prd target: ${PRD_REL}`);
  console.log("mode: sequential momo → prd-writer → prd-reviewer (maxIterations=6)");

  const chains = {};
  const prdBefore = new Set(listPrdFiles());
  const tasksBefore = loadWorkflow(workspace).tasks.length;

  // --- 1) momo: confirm 4 items + create_task ---
  const momoPrompt = [
    `四项已确认：产品事项=${TASK_TITLE}；PRD作者=奕枢；PM=奕枢；Owner=奕枢。`,
    `load_skill yxt-workflow，然后 workflow_create_task：标题「${TASK_TITLE}」，stageId=draft，assigneeId=prd-writer，priority=high。`,
    `不要写长文，不要评审。`,
  ].join("\n");

  console.log("\n--- momo (maxIterations=6) ---");
  const momo = await runAgentOnce(
    {
      prompt: momoPrompt,
      agentId: "momo",
      agent: BUSINESS_AGENTS.momo,
      cwd: workspace,
      maxIterations: 6,
      provider: "auto",
      conversationId: "smoke-pipeline-prd-momo",
      history: [],
    },
    { provider: auto.provider, model: auto.model },
  );
  chains.momo = momo.toolsUsed || [];
  console.log("momo toolsUsed:", chains.momo);
  console.log("momo finalText:", snippet(momo.finalText, 300));

  const wfAfterMomo = loadWorkflow(workspace);
  const created =
    chains.momo.includes("workflow_create_task") ||
    wfAfterMomo.tasks.some(
      (t) => t.title.includes(TASK_TITLE) || t.title.includes("管道验收"),
    ) ||
    wfAfterMomo.tasks.length > tasksBefore;
  console.log(
    `create: ${created} (tasks ${tasksBefore} → ${wfAfterMomo.tasks.length})`,
  );

  // --- 2) prd-writer: short PRD file ---
  const writerPrompt = [
    `产品事项：${TASK_TITLE}。`,
    `load_skill prd-write，用 write_file 写一份极短 PRD 到「${PRD_REL}」。`,
    `首行标题 # 管道验收 PRD。含：问题、目标、1 条验收（When I do X / I see Y）。`,
    `不要评审。`,
  ].join("\n");

  console.log("\n--- prd-writer (maxIterations=6) ---");
  const writer = await runAgentOnce(
    {
      prompt: writerPrompt,
      agentId: "prd-writer",
      agent: BUSINESS_AGENTS["prd-writer"],
      cwd: workspace,
      maxIterations: 6,
      provider: "auto",
      conversationId: "smoke-pipeline-prd-writer",
      history: [],
    },
    { provider: auto.provider, model: auto.model },
  );
  chains.writer = writer.toolsUsed || [];
  console.log("writer toolsUsed:", chains.writer);
  console.log("writer finalText:", snippet(writer.finalText, 300));

  const prdAfter = listPrdFiles();
  const targetAbs = path.join(workspace, PRD_REL);
  const fileWritten =
    chains.writer.includes("write_file") ||
    chains.writer.includes("edit_file") ||
    fs.existsSync(targetAbs) ||
    prdAfter.some((f) => !prdBefore.has(f) && f.includes("管道"));
  console.log(`fileWritten: ${fileWritten} (exists target=${fs.existsSync(targetAbs)})`);

  // Prefer target path; else newest 管道* file under PRD dir
  let reviewPath = PRD_REL;
  if (!fs.existsSync(targetAbs)) {
    const hit = prdAfter.find((f) => f.includes("管道"));
    if (hit) reviewPath = hit;
  }

  // --- 3) prd-reviewer: read + 结论 ---
  const reviewerPrompt = [
    `load_skill prd-review，read_file「${reviewPath}」，给简短评审。`,
    `最终第一行必须是：结论：通过 / 结论：有条件通过 / 结论：打回。`,
  ].join("\n");

  console.log("\n--- prd-reviewer (maxIterations=6) ---");
  const reviewer = await runAgentOnce(
    {
      prompt: reviewerPrompt,
      agentId: "prd-reviewer",
      agent: BUSINESS_AGENTS["prd-reviewer"],
      cwd: workspace,
      maxIterations: 6,
      provider: "auto",
      conversationId: "smoke-pipeline-prd-reviewer",
      history: [],
    },
    { provider: auto.provider, model: auto.model },
  );
  chains.reviewer = reviewer.toolsUsed || [];
  const reviewText = reviewer.finalText || "";
  console.log("reviewer toolsUsed:", chains.reviewer);
  console.log("reviewer finalText:", snippet(reviewText, 400));

  const conclusionPresent = /结论\s*[：:]\s*(通过|有条件通过|打回)/.test(
    reviewText,
  );
  console.log(`conclusionPresent: ${conclusionPresent}`);

  // --- summary ---
  console.log("\n--- tool chains ---");
  console.log(JSON.stringify(chains, null, 2));

  console.log("\n--- checks ---");
  console.log(`created=${created}`);
  console.log(`fileWritten=${fileWritten}`);
  console.log(`conclusionPresent=${conclusionPresent}`);

  // PASS if any stage succeeded (OR semantics as specified)
  const pass = created || fileWritten || conclusionPresent;
  if (!pass) {
    console.error(
      "FAIL  pipeline-prd: none of create / file / conclusion succeeded",
    );
    process.exit(2);
  }
  console.log("PASS  pipeline-prd smoke");
  process.exit(0);
} catch (e) {
  console.error("FAIL ", e instanceof Error ? e.message : e);
  process.exit(2);
}
