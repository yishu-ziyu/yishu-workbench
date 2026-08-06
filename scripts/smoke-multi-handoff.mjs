/**
 * Live smoke: momo handoff_to_agent → prd-reviewer.
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

const HANDOFF_PROMPT =
  "请 handoff_to_agent 给 prd-reviewer，brief=请用一句话说明 workflow.md 是否列出人工门禁，artifactPaths=General/PRD - Spec 评审/workflow.md。然后简短确认已交接。";

try {
  const { resolveAutoProvider } = load(
    path.join(root, "src/lib/agent/providers/openai-compat.ts"),
  );
  const { runAgentOnce } = load(path.join(root, "src/lib/agent/loop.ts"));
  const orch = load(path.join(root, "src/lib/agent/multi/orchestrator.ts"));
  const { BUSINESS_AGENTS } = orch;
  const runMultiAgent =
    typeof orch.runMultiAgent === "function" ? orch.runMultiAgent : null;

  const auto = resolveAutoProvider();
  if (!auto.provider) {
    console.log("SKIP no key");
    process.exit(0);
  }
  console.log(
    `provider: ${auto.provider.id} (${auto.reason}) model=${auto.model}`,
  );
  console.log("mode: runAgentOnce momo handoff → prd-reviewer");

  console.log("\n--- primary (momo, maxIterations=6) ---");
  const result = await runAgentOnce(
    {
      prompt: HANDOFF_PROMPT,
      agentId: "momo",
      agent: BUSINESS_AGENTS.momo,
      cwd: workspace,
      maxIterations: 6,
      provider: "auto",
      conversationId: `smoke-multi-handoff-${Date.now()}`,
    },
    { provider: auto.provider, model: auto.model },
  );

  const toolsUsed = result.toolsUsed || [];
  const finalText = result.finalText || "";
  console.log("toolsUsed:", toolsUsed);
  console.log("finalText:", snippet(finalText, 500));

  if (result.trajectory?.success === false) {
    console.error(
      "FAIL  agent run failed:",
      result.trajectory?.error || "unknown",
    );
    process.exit(2);
  }

  const hasHandoff = toolsUsed.includes("handoff_to_agent");
  console.log("\n--- checks ---");
  console.log(`toolsUsed includes handoff_to_agent: ${hasHandoff}`);

  if (!hasHandoff) {
    console.error(
      "FAIL  multi-handoff: missing handoff_to_agent; used=",
      toolsUsed.join(",") || "(none)",
    );
    process.exit(2);
  }

  // Optional: drain multi mode if available (same prompt, maxHandoffs 1)
  if (runMultiAgent) {
    console.log("\n--- optional runMultiAgent (maxHandoffs=1) ---");
    try {
      const gen = runMultiAgent(
        {
          prompt: HANDOFF_PROMPT,
          agentId: "momo",
          cwd: workspace,
          maxIterations: 6,
          provider: "auto",
          conversationId: `smoke-multi-handoff-multi-${Date.now()}`,
        },
        {
          provider: auto.provider,
          model: auto.model,
          maxHandoffs: 1,
        },
      );
      let multiResult;
      for (;;) {
        const n = await gen.next();
        if (n.done) {
          multiResult = n.value;
          break;
        }
      }
      const multiTools = multiResult?.primary?.toolsUsed || [];
      const multiHandoffs = multiResult?.handoffs?.length ?? 0;
      const multiFinal = [
        multiResult?.primary?.finalText || "",
        ...(multiResult?.handoffs || []).map((h) => h.result?.finalText || ""),
      ]
        .filter(Boolean)
        .join("\n");
      console.log("multi primary toolsUsed:", multiTools);
      console.log("multi handoffs.length:", multiHandoffs);
      console.log("multi final slice:", snippet(multiFinal, 400));
      console.log(
        `multi primary handoff tool: ${multiTools.includes("handoff_to_agent")}`,
      );
    } catch (multiErr) {
      // Optional path: do not fail the smoke on multi-only errors
      console.warn(
        "WARN  optional runMultiAgent:",
        multiErr instanceof Error ? multiErr.message : multiErr,
      );
    }
  } else {
    console.log("\n(skip optional runMultiAgent: not exported)");
  }

  console.log("\nPASS  multi-handoff smoke");
  process.exit(0);
} catch (e) {
  console.error("FAIL ", e instanceof Error ? e.message : e);
  process.exit(2);
}
