/**
 * Live smoke: PRD business path (skill + workflow read).
 * Loads ~/.config/ai-providers/env.local
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

  const result = await runAgentOnce(
    {
      prompt:
        "请 load_skill yxt-workflow，再 read_file「General/PRD - Spec 评审/workflow.md」，用 workflow_get 看任务，最后用中文简短说明当前定制项清单还缺什么（不要创建任务）。",
      agentId: "momo",
      agent: BUSINESS_AGENTS.momo,
      cwd: workspace,
      maxIterations: 8,
      provider: "auto",
    },
    { provider: auto.provider, model: auto.model },
  );

  console.log("toolsUsed:", result.toolsUsed);
  console.log("finalText:", (result.finalText || "").slice(0, 600));

  const tools = result.toolsUsed || [];
  const usedKeyTool =
    tools.includes("load_skill") ||
    tools.includes("read_file") ||
    tools.includes("workflow_get");
  const textOk = (result.finalText || "").length > 20;
  const ok = usedKeyTool && textOk;

  if (!ok || result.trajectory?.success === false) {
    console.error(
      "FAIL  agent run failed:",
      result.trajectory?.error ||
        (!usedKeyTool ? "missing load_skill|read_file|workflow_get" : "short finalText"),
    );
    process.exit(2);
  }
  console.log("PASS  prd business smoke");
  process.exit(0);
} catch (e) {
  console.error("FAIL ", e instanceof Error ? e.message : e);
  process.exit(2);
}
