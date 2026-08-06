import type {
  ChatMessage,
  LlmChatRequest,
  LlmChatResponse,
  LlmProvider,
  ToolCall,
} from "../types";
import { ensureAiProviderEnv } from "../load-env";

export type OpenAiCompatConfig = {
  id: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
};

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * OpenAI Chat Completions compatible provider (Stepfun / MiniMax / Volcengine / etc).
 */
export function createOpenAiCompatProvider(
  cfg: OpenAiCompatConfig,
): LlmProvider {
  const base = normalizeBase(cfg.baseUrl);
  return {
    id: cfg.id,
    async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
      const model = req.model || cfg.defaultModel;
      const body: Record<string, unknown> = {
        model,
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
      };
      if (req.tools?.length) {
        body.tools = req.tools;
        body.tool_choice = "auto";
      }

      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: req.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `LLM ${cfg.id} HTTP ${res.status}: ${text.slice(0, 800)}`,
        );
      }

      const data = (await res.json()) as {
        choices?: Array<{
          message?: {
            role?: string;
            content?: string | null;
            tool_calls?: ToolCall[];
          };
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const msg = data.choices?.[0]?.message;
      if (!msg) {
        throw new Error(`LLM ${cfg.id}: empty choices`);
      }

      const message: ChatMessage = {
        role: "assistant",
        content: msg.content ?? null,
        tool_calls: msg.tool_calls,
      };

      return {
        message,
        usage: data.usage,
        raw: data,
      };
    },
  };
}

function collectConfiguredProviders(): Array<{
  provider: LlmProvider;
  model: string;
  reason: string;
}> {
  const out: Array<{ provider: LlmProvider; model: string; reason: string }> =
    [];

  // Default prefer Grok 4.5 (local CLIProxy 8317). Override:
  // YXT_LLM_PREFER=grok|minimax|stepfun|volcengine
  const prefer = (process.env.YXT_LLM_PREFER || "grok").toLowerCase();

  // --- Grok 4.5 via CLIProxy OpenAI-compatible (AI组件工作流库 · cli-proxy-api-subscription-pool)
  // Base: http://127.0.0.1:8317/v1  Key: ~/.cli-proxy-api/client.env OPENAI_API_KEY
  const grokKey =
    process.env.GROK_API_KEY ||
    process.env.XAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "";
  const grokBase =
    process.env.GROK_BASE_URL ||
    process.env.XAI_BASE_URL ||
    (process.env.OPENAI_BASE_URL &&
    /8317|cli-proxy/i.test(process.env.OPENAI_BASE_URL)
      ? process.env.OPENAI_BASE_URL
      : "") ||
    "http://127.0.0.1:8317/v1";
  const grokModel =
    process.env.YXT_GROK_MODEL ||
    process.env.GROK_MODEL ||
    "grok-4.5";
  if (grokKey && grokBase) {
    out.push({
      provider: createOpenAiCompatProvider({
        id: "grok",
        baseUrl: grokBase,
        apiKey: grokKey,
        defaultModel: grokModel,
      }),
      model: grokModel,
      reason: "GROK/CLIProxy (8317)",
    });
  }

  const mmKey =
    process.env.MINIMAX_API_KEY || process.env.MINIMAX_TOKEN_PLAN_KEY || "";
  const mmBase =
    process.env.MINIMAX_OPENAI_BASE_URL || "https://api.minimaxi.com/v1";
  const mmModel = process.env.MINIMAX_MODEL || "MiniMax-M2.5";
  if (mmKey) {
    out.push({
      provider: createOpenAiCompatProvider({
        id: "minimax",
        baseUrl: mmBase,
        apiKey: mmKey,
        defaultModel: mmModel,
      }),
      model: mmModel,
      reason: "MINIMAX_API_KEY",
    });
  }

  const stepKey =
    process.env.STEPFUN_API_KEY || process.env.STEP_API_KEY || "";
  const stepBase =
    process.env.STEPFUN_OPENAI_BASE_URL || "https://api.stepfun.com/v1";
  const stepModel = process.env.STEPFUN_CHAT_MODEL || "step-3.7-flash";
  if (stepKey) {
    const base = stepBase.includes("step_plan")
      ? "https://api.stepfun.com/v1"
      : stepBase;
    out.push({
      provider: createOpenAiCompatProvider({
        id: "stepfun",
        baseUrl: base,
        apiKey: stepKey,
        defaultModel: stepModel,
      }),
      model: stepModel,
      reason: "STEPFUN_API_KEY",
    });
  }

  const volcKey = process.env.VOLCENGINE_AGENT_PLAN_API_KEY || "";
  const volcBase = process.env.VOLCENGINE_AGENT_PLAN_OPENAI_BASE_URL || "";
  const volcModel =
    process.env.VOLCENGINE_AGENT_PLAN_MODEL || "doubao-seed-2.0-mini";
  if (volcKey && volcBase) {
    out.push({
      provider: createOpenAiCompatProvider({
        id: "volcengine",
        baseUrl: volcBase,
        apiKey: volcKey,
        defaultModel: volcModel,
      }),
      model: volcModel,
      reason: "VOLCENGINE_AGENT_PLAN_API_KEY",
    });
  }

  if (prefer && out.length > 1) {
    out.sort((a, b) => {
      const score = (id: string) => {
        if (id.includes(prefer)) return 0;
        if (prefer === "grok" && (id.includes("xai") || id.includes("grok")))
          return 0;
        return 1;
      };
      return score(a.provider.id) - score(b.provider.id);
    });
  }
  return out;
}

/** Failover chain: on 402/429/5xx try next provider. */
export function createFailoverProvider(
  chain: Array<{ provider: LlmProvider; model: string; reason: string }>,
): LlmProvider {
  return {
    id: chain.map((c) => c.provider.id).join("|") || "empty",
    async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
      let lastErr: Error | null = null;
      for (const item of chain) {
        try {
          return await item.provider.chat({
            ...req,
            model: req.model || item.model,
          });
        } catch (e) {
          lastErr = e instanceof Error ? e : new Error(String(e));
          const msg = lastErr.message;
          const retryable =
            /HTTP (402|429|500|502|503)/.test(msg) ||
            /quota|rate limit|timeout/i.test(msg);
          if (!retryable) throw lastErr;
          // try next
        }
      }
      throw lastErr || new Error("No LLM providers in chain");
    },
  };
}

/** Resolve best available provider from process env (failover-enabled). */
export function resolveAutoProvider(): {
  provider: LlmProvider | null;
  model: string;
  reason: string;
} {
  ensureAiProviderEnv();
  const chain = collectConfiguredProviders();
  if (!chain.length) {
    return { provider: null, model: "", reason: "no_api_key" };
  }
  if (chain.length === 1) {
    return {
      provider: chain[0].provider,
      model: chain[0].model,
      reason: chain[0].reason,
    };
  }
  return {
    provider: createFailoverProvider(chain),
    model: chain[0].model,
    reason: chain.map((c) => c.reason).join("→"),
  };
}

/** Deterministic mock for eval / offline (Ch6). */
export function createMockProvider(
  script: Array<
    | {
        type: "tool_calls";
        calls: Array<{ name: string; arguments: Record<string, unknown> }>;
        content?: string | null;
      }
    | { type: "final"; content: string }
  >,
): LlmProvider {
  let i = 0;
  return {
    id: "mock",
    async chat(): Promise<LlmChatResponse> {
      const turn = script[i] ?? { type: "final" as const, content: "done" };
      i += 1;
      if (turn.type === "final") {
        return {
          message: { role: "assistant", content: turn.content },
        };
      }
      const tool_calls: ToolCall[] = turn.calls.map((c, idx) => ({
        id: `call_mock_${i}_${idx}`,
        type: "function",
        function: {
          name: c.name,
          arguments: JSON.stringify(c.arguments ?? {}),
        },
      }));
      return {
        message: {
          role: "assistant",
          content: turn.content ?? null,
          tool_calls,
        },
      };
    },
  };
}

export function stripSystemFromHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>,
): ChatMessage[] {
  return history.map((m) => ({ role: m.role, content: m.content }));
}
