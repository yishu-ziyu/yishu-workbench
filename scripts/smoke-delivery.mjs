/**
 * Live smoke: delivery agent + workflow perceive tools.
 * 1) env + minimax
 * 2) runAgentOnce delivery: 查看 workflow 中 shipped/dev 任务，用 workflow_get，
 *    中文说明是否有待交付确认的 human gate
 * 3) PASS if tools include workflow_get or workflow_list_human_gates
 *
 * Run: node scripts/smoke-delivery.mjs
 * Exit: 0 pass/skip, 1 crash, 2 LLM/agent fail
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const workspace = path.join(root, "workspace");

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

  const auto = resolveAutoProvider();
  if (!auto.provider) {
    console.log("SKIP no key");
    process.exit(0);
  }
  console.log(
    `provider: ${auto.provider.id} (${auto.reason}) model=${auto.model}`,
  );
  console.log(`prefer: ${process.env.YXT_LLM_PREFER}`);

  const prompt = [
    "请查看 workflow 中处于 shipped（已交付）和 dev（开发中）阶段的任务。",
    "必须先调用 workflow_get（或 workflow_list_human_gates）获取真实状态，不要编造。",
    "用中文说明：当前是否有待交付确认的 human gate（shipped 门禁上是否有等待任务），",
    "以及 dev 阶段有哪些任务。只读不写，不要 move/create 任务。",
  ].join("");

  console.log("\n--- delivery (maxIterations=6) ---");
  console.log("prompt:", snippet(prompt, 240));

  const result = await runAgentOnce(
    {
      prompt,
      agentId: "delivery",
      agent: BUSINESS_AGENTS.delivery,
      cwd: workspace,
      maxIterations: 6,
      provider: "auto",
      conversationId: `smoke-delivery-${Date.now()}`,
      history: [],
    },
    { provider: auto.provider, model: auto.model },
  );

  const tools = result.toolsUsed || [];
  const finalText = result.finalText || "";
  console.log("\ntoolsUsed:", tools);
  console.log("finalText:", snippet(finalText, 500));

  if (result.trajectory?.success === false) {
    console.error(
      "FAIL  agent run failed:",
      result.trajectory?.error || "unknown",
    );
    process.exit(2);
  }

  const perceiveOk =
    tools.includes("workflow_get") ||
    tools.includes("workflow_list_human_gates");

  console.log("\n--- checks ---");
  console.log(`tools has workflow_get: ${tools.includes("workflow_get")}`);
  console.log(
    `tools has workflow_list_human_gates: ${tools.includes("workflow_list_human_gates")}`,
  );
  console.log(`perceive OK: ${perceiveOk}`);

  if (!perceiveOk) {
    console.error(
      "FAIL  delivery smoke: missing workflow_get / workflow_list_human_gates",
    );
    process.exit(2);
  }

  console.log("PASS  delivery smoke");
  process.exit(0);
} catch (e) {
  console.error("FAIL ", e instanceof Error ? e.message : e);
  if (e instanceof Error && e.stack) console.error(e.stack);
  process.exit(2);
}
