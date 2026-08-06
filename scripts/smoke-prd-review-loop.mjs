/**
 * Live smoke: PRD writer → reviewer sequential loop.
 * Loads ~/.config/ai-providers/env.local
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

function snippet(text, n = 280) {
  const s = (text || "").replace(/\s+/g, " ").trim();
  return s.length <= n ? s : s.slice(0, n) + "…";
}

try {
  const { resolveAutoProvider } = load(
    path.join(root, "src/lib/agent/providers/openai-compat.ts"),
  );
  const { runAgentOnce } = load(path.join(root, "src/lib/agent/loop.ts"));
  // Prefer sequential runAgentOnce (maxIterations 6 each).
  // runProposerReviewer is available if a single-entry peer loop is needed later.
  const { BUSINESS_AGENTS, runProposerReviewer } = load(
    path.join(root, "src/lib/agent/multi/orchestrator.ts"),
  );
  if (typeof runProposerReviewer !== "function") {
    throw new Error("runProposerReviewer not exported from orchestrator");
  }

  const auto = resolveAutoProvider();
  if (!auto.provider) {
    console.log("SKIP no key");
    process.exit(0);
  }
  console.log(
    `provider: ${auto.provider.id} (${auto.reason}) model=${auto.model}`,
  );
  console.log(`prd: ${PRD_REL}`);
  console.log("mode: sequential runAgentOnce (prd-writer → prd-reviewer)");

  const writerPrompt = [
    `请作为 PRD 撰写员，用 read_file 读取 workspace 内文件：`,
    `「${PRD_REL}」`,
    ``,
    `任务：`,
    `1. 指出该 PRD 缺少的验收条目（相对问题/目标/场景应有的 When I do X / I see Y）。`,
    `2. 建议补 2 条 BDD 验收（Given/When/Then 或 When I do X / I see Y 均可）。`,
    `3. 可写入新文件（如同目录下的补丁 md），或只在最终回复输出；二选一即可。`,
    `不要编造未读到的内容。`,
  ].join("\n");

  console.log("\n--- writer (prd-writer, maxIterations=6) ---");
  const writer = await runAgentOnce(
    {
      prompt: writerPrompt,
      agentId: "prd-writer",
      agent: BUSINESS_AGENTS["prd-writer"],
      cwd: workspace,
      maxIterations: 6,
      provider: "auto",
    },
    { provider: auto.provider, model: auto.model },
  );

  const writerText = writer.finalText || "";
  console.log("writer toolsUsed:", writer.toolsUsed);
  console.log("writer finalText:", snippet(writerText, 400));
  if (writer.trajectory?.success === false) {
    console.error("FAIL  writer failed:", writer.trajectory?.error || "unknown");
    process.exit(2);
  }

  const reviewerPrompt = [
    `请作为独立 PRD 评审员，评审撰写员刚产出的内容（不要代写正文）。`,
    ``,
    `【撰写员产出】`,
    writerText.slice(0, 6000),
    ``,
    `【原 PRD 路径，可按需 read_file 核对】`,
    PRD_REL,
    ``,
    `给出明确结论之一：通过 / 有条件通过 / 打回。`,
    `说明理由；若有条件通过或打回，列出必须补齐项。`,
  ].join("\n");

  console.log("\n--- reviewer (prd-reviewer, maxIterations=6) ---");
  const reviewer = await runAgentOnce(
    {
      prompt: reviewerPrompt,
      agentId: "prd-reviewer",
      agent: BUSINESS_AGENTS["prd-reviewer"],
      cwd: workspace,
      maxIterations: 6,
      provider: "auto",
      conversationId: "smoke-prd-review-loop-reviewer",
      history: [],
    },
    { provider: auto.provider, model: auto.model },
  );

  const reviewText = reviewer.finalText || "";
  console.log("reviewer toolsUsed:", reviewer.toolsUsed);
  console.log("reviewer finalText:", snippet(reviewText, 400));
  if (reviewer.trajectory?.success === false) {
    console.error(
      "FAIL  reviewer failed:",
      reviewer.trajectory?.error || "unknown",
    );
    process.exit(2);
  }

  const writerOk = writerText.length > 40;
  const reviewOk = reviewText.length > 40;
  const verdictOk = /通过|打回|条件/.test(reviewText);

  console.log("\n--- checks ---");
  console.log(`writerText.length=${writerText.length} (>40: ${writerOk})`);
  console.log(`reviewText.length=${reviewText.length} (>40: ${reviewOk})`);
  console.log(`reviewer has 通过|打回|条件: ${verdictOk}`);

  if (!writerOk || !reviewOk || !verdictOk) {
    console.error(
      "FAIL  prd review loop:",
      [
        !writerOk && "writer finalText too short",
        !reviewOk && "reviewer finalText too short",
        !verdictOk && "reviewer missing 通过/打回/条件",
      ]
        .filter(Boolean)
        .join("; "),
    );
    process.exit(2);
  }

  console.log("PASS  prd review loop smoke");
  process.exit(0);
} catch (e) {
  console.error("FAIL ", e instanceof Error ? e.message : e);
  process.exit(2);
}
