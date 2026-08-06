import type {
  AgentEvent,
  AgentProfileRuntime,
  ChatMessage,
  LlmProvider,
  RunRequest,
  ToolCall,
  Trajectory,
} from "./types";
import { ToolRegistry } from "./tools/registry";
import { createWorkspaceTools } from "./tools/workspace-tools";
import {
  createMemoryTools,
  maybeDistillEpisode,
} from "./tools/memory-tools";
import { createWorkflowTools } from "./tools/workflow-tools";
import { createCollabTools } from "./tools/collab-tools";
import { createShellTools } from "./tools/shell-tools";
import { createTrajectoryTools } from "./tools/trajectory-tools";
import { createMcpStubTools } from "./tools/mcp-stub";
import {
  createSkillTool,
  ensureBundledSkills,
  formatSkillsIndex,
} from "./skills/loader";
import {
  assembleMessages,
  buildDynamicSystemSuffix,
  buildStaticSystemPrefix,
  compressMessages,
  loadProjectInstructions,
} from "./context";
import {
  appendStep,
  createTrajectory,
  finalizeTrajectory,
  persistTrajectory,
} from "./trajectory";
import { defaultWorkspaceRoot, agentRoot } from "./paths";
import {
  createMockProvider,
  resolveAutoProvider,
} from "./providers/openai-compat";
import { BUSINESS_AGENTS } from "./agents";
import { hasPrdVerdict } from "./completion";
import fs from "node:fs";

/** Strip MiniMax/Qwen-style internal think blocks from user-facing text. */
export function stripThinkTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim();
}

/**
 * Stable fingerprint for tool call loop detection (Ch5 harness recovery).
 * Same name + same args object → same signature regardless of key order.
 */
export function toolCallSignature(name: string, argsObj: unknown): string {
  let argsPart: string;
  try {
    if (argsObj && typeof argsObj === "object" && !Array.isArray(argsObj)) {
      const rec = argsObj as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(rec).sort()) sorted[k] = rec[k];
      argsPart = JSON.stringify(sorted);
    } else {
      argsPart = JSON.stringify(argsObj ?? {});
    }
  } catch {
    argsPart = String(argsObj);
  }
  return `${name}::${argsPart}`;
}

/** True when the last `window` signatures are identical and non-empty. */
export function isRepeatedToolSignature(
  signatures: string[],
  window = 3,
): boolean {
  if (signatures.length < window || window < 2) return false;
  const slice = signatures.slice(-window);
  const head = slice[0];
  if (!head) return false;
  return slice.every((s) => s === head);
}

export function buildDefaultRegistry(): ToolRegistry {
  const reg = new ToolRegistry();
  reg.registerAll([
    ...createWorkspaceTools(),
    ...createMemoryTools(),
    ...createWorkflowTools(),
    ...createCollabTools(),
    ...createShellTools(),
    ...createTrajectoryTools(),
    ...createMcpStubTools(),
    createSkillTool(),
  ]);
  return reg;
}

export type LoopResult = {
  finalText: string;
  trajectory: Trajectory;
  toolsUsed: string[];
  messages: ChatMessage[];
};

function defaultAgent(req: RunRequest): AgentProfileRuntime {
  return (
    req.agent || {
      id: req.agentId || "momo",
      name: req.agentId || "momo",
      role: "个人 AI 同事 · 编排与上下文",
    }
  );
}

/**
 * Core ReAct loop (Ch1/Ch2): while tool_calls → execute → append → continue.
 */
export async function* runAgentLoop(
  req: RunRequest,
  opts?: {
    provider?: LlmProvider;
    registry?: ToolRegistry;
    model?: string;
  },
): AsyncGenerator<AgentEvent, LoopResult> {
  const workspaceRoot = defaultWorkspaceRoot(req.cwd);
  fs.mkdirSync(agentRoot(workspaceRoot), { recursive: true });
  ensureBundledSkills(workspaceRoot);

  const agent = defaultAgent(req);
  const registry = opts?.registry ?? buildDefaultRegistry();
  const maxIter = req.maxIterations ?? 12;
  const envMaxTools = Number(process.env.YXT_MAX_TOOLS);
  const maxToolsPerRun =
    req.maxToolsPerRun ??
    (Number.isFinite(envMaxTools) && envMaxTools > 0 ? envMaxTools : 40);
  const conversationId = req.conversationId || `conv-${Date.now()}`;

  let provider = opts?.provider;
  let model = opts?.model || req.model || "";

  if (!provider) {
    if (req.provider === "mock") {
      provider = createMockProvider([{ type: "final", content: "mock empty" }]);
      model = "mock";
    } else {
      const auto = resolveAutoProvider();
      provider = auto.provider ?? undefined;
      model = model || auto.model;
      if (!provider) {
        yield {
          type: "error",
          message:
            "No LLM provider configured (need STEPFUN_API_KEY / MINIMAX / VOLCENGINE). Falling back message only.",
        };
        const text =
          "无法启动 Agent 运行时：未配置可用的 LLM API Key。请在环境中设置 STEPFUN_API_KEY 或 MINIMAX_API_KEY，或使用 CLI 模式。";
        yield { type: "done", exitCode: 1, finalText: text };
        const tr = createTrajectory({
          conversationId,
          agentId: agent.id,
          prompt: req.prompt,
        });
        finalizeTrajectory(tr, { finalText: text, success: false, error: "no_provider" });
        persistTrajectory(workspaceRoot, tr);
        return {
          finalText: text,
          trajectory: tr,
          toolsUsed: [],
          messages: [],
        };
      }
      yield {
        type: "step",
        kind: "log",
        label: `LLM provider: ${auto.reason}`,
        detail: model,
      };
    }
  }

  // Ch2 partial prefix freeze: static identity/rules/skills built once;
  // dynamic status/memories live in a separate system message (built once at
  // start for simplicity - status is in the dynamic part, not the frozen prefix).
  const skillsIndex = formatSkillsIndex(workspaceRoot);
  const projectInstr = loadProjectInstructions(workspaceRoot);
  const staticSystem = buildStaticSystemPrefix(agent, skillsIndex, projectInstr);
  const dynamicSystem = buildDynamicSystemSuffix(workspaceRoot, agent);
  let messages = assembleMessages({
    system: staticSystem,
    dynamicSystem,
    history: req.history,
    prompt: req.prompt,
  });

  const trajectory = createTrajectory({
    conversationId,
    agentId: agent.id,
    prompt: req.prompt,
  });

  const toolsUsed: string[] = [];
  const toolDefs = registry.listDefinitions();

  const toolCtxBase = {
    workspaceRoot,
    agentRoot: agentRoot(workspaceRoot),
    agentId: agent.id,
    agentRole: agent.role,
    conversationId,
    signal: undefined as AbortSignal | undefined,
    state: {} as Record<string, unknown>,
  };

  yield {
    type: "step",
    kind: "think",
    label: "ReAct 循环启动",
    detail: `maxIterations=${maxIter} maxToolsPerRun=${maxToolsPerRun} tools=${toolDefs.length}`,
  };
  yield {
    type: "status",
    text: `agent=${agent.id} model=${model}`,
  };

  let finalText = "";
  let runSuccess = true;
  let runError: string | undefined;
  /** Consecutive tool fingerprints for stuck-loop circuit breaker (Ch5). */
  const recentToolSigs: string[] = [];

  for (let iter = 0; iter < maxIter; iter++) {
    yield {
      type: "step",
      kind: "think",
      label: `思考 · 第 ${iter + 1}/${maxIter} 轮`,
    };

    // Compress if context grows large
    if (messages.length > 24) {
      messages = compressMessages(messages);
      yield {
        type: "step",
        kind: "log",
        label: "上下文压缩",
        detail: `messages=${messages.length}`,
      };
    }

    let response;
    try {
      response = await provider.chat({
        model,
        messages,
        tools: toolDefs,
        temperature: 0.2,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      yield { type: "error", message: msg };
      finalizeTrajectory(trajectory, {
        finalText: finalText || msg,
        success: false,
        error: msg,
      });
      persistTrajectory(workspaceRoot, trajectory);
      yield {
        type: "done",
        exitCode: 1,
        finalText: finalText || `LLM 错误：${msg}`,
      };
      return {
        finalText: finalText || msg,
        trajectory,
        toolsUsed,
        messages,
      };
    }

    const assistantMsg = response.message;
    messages.push({
      role: "assistant",
      content: assistantMsg.content,
      tool_calls: assistantMsg.tool_calls,
    });

    const calls = assistantMsg.tool_calls || [];
    if (!calls.length) {
      finalText = stripThinkTags((assistantMsg.content || "").trim());
      // Harness completion gate (Ch1/Ch6): PRD reviewer must emit 结论： line
      const needsVerdict =
        toolCtxBase.agentId === "prd-reviewer" && !hasPrdVerdict(finalText);
      if (needsVerdict && iter < maxIter - 1) {
        yield {
          type: "step",
          kind: "log",
          label: "完成门：缺少结论行，要求补写",
        };
        messages.push({
          role: "user",
          content:
            "【系统完成门】你的最终答复缺少必填第一行「结论：通过|有条件通过|打回」。请不要再调工具，直接补写完整评审结论（第一行必须是结论）。",
        });
        continue;
      }
      if (finalText) {
        yield { type: "token", text: finalText };
      }
      appendStep(trajectory, {
        iteration: iter,
        assistantContent: assistantMsg.content,
        ts: new Date().toISOString(),
      });
      break;
    }

    // Execute tools. Book: multi tool parallel when independent;
    // fall back to sequential if any call is dangerous.
    const toolResults: Array<{ callId: string; name: string; result: string }> =
      [];

    type PreparedCall = {
      call: ToolCall;
      name: string;
      argsObj: unknown;
      stepKind: string;
      argsDetail: string;
    };

    const prepared: PreparedCall[] = calls.map((call) => {
      const name = call.function.name;
      toolsUsed.push(name);
      let argsObj: unknown = {};
      try {
        argsObj = JSON.parse(call.function.arguments || "{}");
      } catch {
        argsObj = { _raw: call.function.arguments };
      }
      const stepKind =
        name.startsWith("read") ||
        name.includes("search") ||
        name.includes("list")
          ? "read"
          : name.includes("skill")
            ? "skill"
            : name.includes("workflow") ||
                name.includes("handoff") ||
                name === "transfer_role"
              ? "mcp"
              : "cli";
      const argsDetail =
        typeof argsObj === "object"
          ? JSON.stringify(argsObj).slice(0, 200)
          : String(argsObj).slice(0, 200);
      return { call, name, argsObj, stepKind, argsDetail };
    });

    const anyDangerous = prepared.some(
      (p) => registry.get(p.name)?.dangerous === true,
    );
    // Parallel tool execution (Book): independent non-dangerous tools run via Promise.all.
    // Dangerous tools (or mixed batches) stay sequential for safety / side-effect order.
    const runParallel = prepared.length > 1 && !anyDangerous;

    const executeOne = async (p: PreparedCall): Promise<string> =>
      registry.execute(p.name, p.call.function.arguments || "{}", {
        ...toolCtxBase,
        emit: (ev) => {
          /* optional nested */
          void ev;
        },
      });

    // Emit all tool_start events first (stable order = tool_calls order).
    for (const p of prepared) {
      yield {
        type: "tool_start",
        name: p.name,
        args: p.argsObj,
        callId: p.call.id,
      };
      yield {
        type: "step",
        kind: p.stepKind,
        label: `Tool: ${p.name}`,
        detail: p.argsDetail,
      };
    }

    let results: string[];
    if (runParallel) {
      results = await Promise.all(prepared.map((p) => executeOne(p)));
    } else {
      results = [];
      for (const p of prepared) {
        results.push(await executeOne(p));
      }
    }

    // Append tool messages / tool_end in tool_calls order (OpenAI tool_call_id matching).
    for (let i = 0; i < prepared.length; i++) {
      const p = prepared[i];
      const result = results[i];
      toolResults.push({ callId: p.call.id, name: p.name, result });
      yield {
        type: "tool_end",
        name: p.name,
        callId: p.call.id,
        result: result.slice(0, 4000),
      };
      messages.push({
        role: "tool",
        tool_call_id: p.call.id,
        content: result,
      });
    }

    appendStep(trajectory, {
      iteration: iter,
      assistantContent: assistantMsg.content,
      toolCalls: calls as ToolCall[],
      toolResults,
      ts: new Date().toISOString(),
    });

    // Ch10 shared-context multi-stage: apply transfer_role after tools return.
    const pending = toolCtxBase.state.pendingRoleTransfer as
      | { roleId?: string; reason?: string }
      | undefined;
    if (pending?.roleId) {
      const next = BUSINESS_AGENTS[pending.roleId];
      const reason = (pending.reason || "").trim() || "unspecified";
      delete toolCtxBase.state.pendingRoleTransfer;
      if (next) {
        toolCtxBase.agentId = next.id;
        toolCtxBase.agentRole = next.role;
        messages.push({
          role: "system",
          content: `[role transfer] now you are ${next.name} (${next.id}) because: ${reason}`,
        });
        yield {
          type: "step",
          kind: "log",
          label: `角色转换 → ${next.name}`,
          detail: reason,
        };
        yield {
          type: "status",
          text: `agent=${next.id} role=${next.role}`,
        };
      } else {
        yield {
          type: "step",
          kind: "log",
          label: `角色转换失败 · 未知 roleId=${pending.roleId}`,
        };
      }
    }

    // Ch5: circuit breaker — same tool+args fingerprint 3× in a row → stop.
    for (const p of prepared) {
      recentToolSigs.push(toolCallSignature(p.name, p.argsObj));
    }
    // Cap memory; only last few matter for consecutive check.
    if (recentToolSigs.length > 12) {
      recentToolSigs.splice(0, recentToolSigs.length - 12);
    }
    if (isRepeatedToolSignature(recentToolSigs, 3)) {
      const stuckSig = recentToolSigs[recentToolSigs.length - 1] || "";
      finalText =
        `工具循环熔断：同一工具+参数连续调用 3 次，判定卡死已停止。` +
        ` 指纹=${stuckSig.slice(0, 200)}。请换策略、改参数，或人工介入。`;
      runSuccess = false;
      runError = "stuck_loop";
      yield {
        type: "step",
        kind: "log",
        label: "熔断 · 重复工具调用",
        detail: stuckSig.slice(0, 300),
      };
      yield { type: "token", text: finalText };
      yield { type: "error", message: `stuck_loop: ${stuckSig.slice(0, 200)}` };
      break;
    }

    // Soft tool budget: stop after maxToolsPerRun total tool calls (req / YXT_MAX_TOOLS / 40).
    if (toolsUsed.length >= maxToolsPerRun) {
      finalText =
        `已达到本轮工具调用预算（${toolsUsed.length}/${maxToolsPerRun}），软停止。` +
        ` 可通过 maxToolsPerRun 或环境变量 YXT_MAX_TOOLS 调整。最近工具：` +
        toolsUsed.slice(-6).join(", ");
      yield {
        type: "step",
        kind: "log",
        label: "软预算 · 工具调用上限",
        detail: `${toolsUsed.length}/${maxToolsPerRun}`,
      };
      yield { type: "token", text: finalText };
      break;
    }
  }

  if (!finalText) {
    // max iterations (still a controlled stop; not stuck_loop)
    finalText =
      "达到最大工具循环次数，已停止。请缩小任务或继续追问。最近工具：" +
      toolsUsed.slice(-6).join(", ");
    yield { type: "token", text: finalText };
  }

  finalizeTrajectory(trajectory, {
    finalText,
    success: runSuccess,
    error: runError,
    learningSignals: runError === "stuck_loop"
      ? [
          {
            kind: "process_rule",
            label: "stuck_tool_loop",
            score: 0,
            note: recentToolSigs.slice(-3).join(" | "),
          },
          {
            kind: "env_result",
            label: "run_fail",
            score: 0,
            note: "stuck_loop",
          },
        ]
      : undefined,
  });
  const saved = persistTrajectory(workspaceRoot, trajectory);
  // C3-02 light: silent episode distill when run wrote files / created tasks
  if (runSuccess) {
    maybeDistillEpisode(workspaceRoot, {
      toolsUsed,
      prompt: req.prompt,
      agentId: agent.id,
      success: true,
    });
  }
  yield {
    type: "step",
    kind: "log",
    label: "轨迹已保存",
    detail: saved,
  };
  yield {
    type: "done",
    exitCode: runSuccess ? 0 : 1,
    finalText,
  };

  return {
    finalText,
    trajectory,
    toolsUsed,
    messages,
  };
}

/** Non-streaming convenience for eval. */
export async function runAgentOnce(
  req: RunRequest,
  opts?: {
    provider?: LlmProvider;
    registry?: ToolRegistry;
    model?: string;
  },
): Promise<LoopResult> {
  const gen = runAgentLoop(req, opts);
  let last: IteratorResult<AgentEvent, LoopResult>;
  let result: LoopResult | undefined;
  do {
    last = await gen.next();
    if (last.done) {
      result = last.value;
      break;
    }
  } while (!last.done);
  if (!result) {
    throw new Error("Agent loop ended without result");
  }
  return result;
}
