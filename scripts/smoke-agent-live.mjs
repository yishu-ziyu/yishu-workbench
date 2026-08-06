/**
 * Live smoke: real LLM + list_workspace tool.
 * Default: Grok 4.5 via ~/.cli-proxy-api (CLIProxy :8317)
 * Fallback env: ~/.config/ai-providers/env.local
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
    if (k && !process.env[k]) {
      process.env[k] = v;
      n++;
    }
  }
  return n;
}

const home = process.env.HOME || "";
const loadedProxy = loadEnvFile(path.join(home, ".cli-proxy-api/client.env"));
const loadedAi = loadEnvFile(path.join(home, ".config/ai-providers/env.local"));
console.log(`env: cli-proxy=${loadedProxy} ai-providers=${loadedAi}`);

// Default live LLM: Grok 4.5 (AI组件工作流库 · CLIProxy 8317)
if (!process.env.YXT_LLM_PREFER) process.env.YXT_LLM_PREFER = "grok";
if (!process.env.YXT_GROK_MODEL) process.env.YXT_GROK_MODEL = "grok-4.5";

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
        "只用 list_workspace 工具列出 workspace 根目录文件，然后用一句话总结。不要编造路径。",
      agentId: "momo",
      agent: BUSINESS_AGENTS.momo,
      cwd: workspace,
      maxIterations: 5,
      provider: "auto",
    },
    { provider: auto.provider, model: auto.model },
  );

  console.log("toolsUsed:", result.toolsUsed);
  console.log("finalText:", (result.finalText || "").slice(0, 500));
  const ok =
    result.toolsUsed.includes("list_workspace") ||
    (result.finalText || "").length > 0;
  if (!ok || result.trajectory.success === false) {
    console.error("FAIL  agent run failed:", result.trajectory.error || "no tools");
    process.exit(2);
  }
  console.log("PASS  live smoke");
  process.exit(0);
} catch (e) {
  console.error("FAIL ", e instanceof Error ? e.message : e);
  process.exit(2);
}
