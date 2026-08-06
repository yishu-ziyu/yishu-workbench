/**
 * Live smoke: humanGate auto-inbox (momo → pm-review).
 * 1) env + minimax
 * 2) loadWorkflow: pick any task not in pm-review, or create one
 * 3) runAgentOnce momo: 请把任务 id=X 移到 pm-review
 * 4) PASS if tools include workflow_move_task AND
 *    (inbox file has new item OR tools include inbox_push OR auto inbox happened)
 *
 * Run: node scripts/smoke-human-gate-inbox.mjs
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
  const { loadWorkflow, saveWorkflow } = load(
    path.join(root, "src/lib/agent/tools/workflow-tools.ts"),
  );
  const { loadInbox } = load(
    path.join(root, "src/lib/agent/tools/collab-tools.ts"),
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

  // --- pick task not in pm-review, or create one (code, not LLM) ---
  const wf = loadWorkflow(workspace);
  let task = wf.tasks.find((t) => t.stageId !== "pm-review");

  if (!task) {
    task = {
      id: `t-smoke-human-gate-${Date.now()}`,
      number: wf.tasks.length + 1,
      title: "通知中心重设计 · smoke human-gate",
      excerpt: "smoke: task for pm-review humanGate inbox",
      stageId: "ai-review",
      priority: "high",
      assigneeId: "momo",
      updatedAt: new Date().toISOString(),
    };
    wf.tasks.push(task);
    saveWorkflow(workspace, wf);
    console.log(`task: created ${task.id} stage=${task.stageId}`);
  } else {
    console.log(
      `task: reuse ${task.id} stage=${task.stageId} title=${task.title}`,
    );
  }

  const taskId = task.id;
  const inboxBefore = loadInbox(workspace);
  const inboxCountBefore = inboxBefore.length;
  console.log(`inbox before: count=${inboxCountBefore}`);

  const prompt = `请把任务 id=${taskId} 移到 pm-review。只用 workflow_move_task，不要改标题。`;
  console.log("\n--- momo (maxIterations=6) ---");
  console.log("prompt:", snippet(prompt, 240));

  const result = await runAgentOnce(
    {
      prompt,
      agentId: "momo",
      agent: BUSINESS_AGENTS.momo,
      cwd: workspace,
      maxIterations: 6,
      provider: "auto",
      conversationId: `smoke-human-gate-inbox-${Date.now()}`,
      history: [],
    },
    { provider: auto.provider, model: auto.model },
  );

  const tools = result.toolsUsed || [];
  const finalText = result.finalText || "";
  console.log("\ntoolsUsed:", tools);
  console.log("finalText:", snippet(finalText, 400));

  if (result.trajectory?.success === false) {
    console.error(
      "FAIL  agent run failed:",
      result.trajectory?.error || "unknown",
    );
    process.exit(2);
  }

  // --- post state ---
  const after = loadWorkflow(workspace);
  const afterTask = after.tasks.find((t) => t.id === taskId);
  console.log(
    `task after: ${taskId} stage=${afterTask?.stageId ?? "missing"}`,
  );

  const inboxAfter = loadInbox(workspace);
  const inboxCountAfter = inboxAfter.length;
  const inboxGrew = inboxCountAfter > inboxCountBefore;
  const matchingInbox = inboxAfter.find(
    (i) =>
      !i.done &&
      (i.body?.includes(taskId) ||
        i.title?.includes(afterTask?.title || "") ||
        i.title?.includes("PM 评审") ||
        i.title?.includes("pm-review")),
  );

  // Detect autoInbox from tool results in trajectory if present
  let autoInbox = false;
  const steps = result.trajectory?.steps || [];
  if (Array.isArray(steps)) {
    for (const step of steps) {
      const results = Array.isArray(step?.toolResults) ? step.toolResults : [];
      for (const tr of results) {
        const raw = typeof tr?.result === "string" ? tr.result : "";
        if (raw && /"autoInbox"\s*:\s*true/.test(raw)) {
          autoInbox = true;
          break;
        }
        if (
          raw &&
          /"humanGate"\s*:\s*true/.test(raw) &&
          afterTask?.stageId === "pm-review"
        ) {
          autoInbox = true;
          break;
        }
      }
      if (autoInbox) break;
    }
  }
  // Stage moved to pm-review + inbox grew also counts as auto inbox
  if (afterTask?.stageId === "pm-review" && (inboxGrew || matchingInbox)) {
    autoInbox = true;
  }

  console.log("\ninbox head:");
  for (const item of inboxAfter.slice(0, 3)) {
    console.log(
      `  - [${item.kind}] ${item.done ? "done" : "open"} ${item.id}: ${snippet(item.title, 80)}`,
    );
    if (item.body) console.log(`    body: ${snippet(item.body, 120)}`);
  }
  if (inboxAfter.length === 0) console.log("  (empty)");

  const moveOk = tools.includes("workflow_move_task");
  const inboxOk =
    inboxGrew || tools.includes("inbox_push") || autoInbox || !!matchingInbox;

  console.log("\n--- checks ---");
  console.log(`tools has workflow_move_task: ${moveOk}`);
  console.log(`inbox grew (${inboxCountBefore}→${inboxCountAfter}): ${inboxGrew}`);
  console.log(`tools has inbox_push: ${tools.includes("inbox_push")}`);
  console.log(`autoInbox / matching item: ${autoInbox || !!matchingInbox}`);
  console.log(`inbox gate OK: ${inboxOk}`);

  if (!moveOk || !inboxOk) {
    console.error(
      "FAIL  human-gate inbox:",
      [
        !moveOk && "missing workflow_move_task",
        !inboxOk && "no inbox growth / inbox_push / autoInbox",
      ]
        .filter(Boolean)
        .join("; "),
    );
    process.exit(2);
  }

  console.log("PASS  human-gate inbox smoke");
  process.exit(0);
} catch (e) {
  console.error("FAIL ", e instanceof Error ? e.message : e);
  if (e instanceof Error && e.stack) console.error(e.stack);
  process.exit(2);
}
