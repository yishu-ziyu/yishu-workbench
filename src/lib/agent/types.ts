/**
 * Agent runtime types — aligned with AI Agent Book:
 * Agent = LLM + Context + Tools (Ch1)
 * messages list is the context (Ch2)
 */

export type MessageRole = "system" | "user" | "assistant" | "tool";

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
};

export type ChatMessage = {
  role: MessageRole;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type ToolParameterSchema = {
  type: "object";
  properties: Record<
    string,
    {
      type?: string | string[];
      description?: string;
      enum?: string[];
      items?: { type: string };
      default?: unknown;
      [key: string]: unknown;
    }
  >;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
  };
};

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<string> | string;

export type ToolSpec = {
  definition: ToolDefinition;
  handler: ToolHandler;
  /** perceive | execute | collaborate | event | user_comm (Ch4) */
  category: "perceive" | "execute" | "collaborate" | "event" | "user_comm";
  /** If true, requires human approval before execute (guardrail) */
  dangerous?: boolean;
};

export type ToolContext = {
  workspaceRoot: string;
  agentRoot: string; // workspace/.agent
  agentId: string;
  agentRole: string;
  conversationId: string;
  signal?: AbortSignal;
  /** Mutable bag for multi-step state within one run */
  state: Record<string, unknown>;
  emit?: (ev: AgentEvent) => void;
};

export type AgentEvent =
  | { type: "step"; kind: string; label: string; detail?: string }
  | { type: "token"; text: string }
  | { type: "tool_start"; name: string; args: unknown; callId: string }
  | { type: "tool_end"; name: string; callId: string; result: string }
  | { type: "status"; text: string }
  | { type: "done"; exitCode: number; finalText: string }
  | { type: "error"; message: string };

export type AgentProfileRuntime = {
  id: string;
  name: string;
  role: string;
  systemExtra?: string;
  skillIds?: string[];
};

export type RunRequest = {
  prompt: string;
  conversationId?: string;
  agentId?: string;
  agent?: AgentProfileRuntime;
  /** Prior chat messages (user/assistant only from UI); system rebuilt each run */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Skill ids enabled for this agent */
  skillIds?: string[];
  maxIterations?: number;
  /** Soft cap on total tool calls per run (default 40; env YXT_MAX_TOOLS). */
  maxToolsPerRun?: number;
  /** provider override */
  provider?: "auto" | "openai" | "mock" | "cli";
  cliId?: string;
  cwd?: string;
  model?: string;
  /** When true, use multi-agent orchestration if task matches */
  multiAgent?: boolean;
};

export type TrajectoryStep = {
  iteration: number;
  assistantContent: string | null;
  toolCalls?: ToolCall[];
  toolResults?: Array<{ callId: string; name: string; result: string }>;
  ts: string;
};

export type Trajectory = {
  id: string;
  conversationId: string;
  agentId: string;
  prompt: string;
  startedAt: string;
  endedAt?: string;
  steps: TrajectoryStep[];
  finalText?: string;
  success?: boolean;
  error?: string;
  learningSignals?: LearningSignal[];
};

/** Ch8 learning signals from a run */
export type LearningSignal = {
  kind: "env_result" | "process_rule" | "llm_rubric";
  label: string;
  score?: number; // 0-1
  note: string;
};

export type SkillManifest = {
  id: string;
  name: string;
  description: string;
  /** Path relative to workspace/.agent/skills or bundled */
  bodyPath?: string;
  body?: string;
  tools?: string[]; // optional tool allowlist when skill active
};

export type MemoryItem = {
  id: string;
  kind: "preference" | "fact" | "procedure" | "episode";
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  source?: string;
};

export type EvalCase = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  agentId: string;
  /** Expected tool names that must appear (subset) */
  expectTools?: string[];
  /** Substrings that must appear in final answer */
  expectContains?: string[];
  /** Substrings that must NOT appear */
  forbidContains?: string[];
  maxIterations?: number;
  /** If true, run with mock provider only (deterministic) */
  mockOnly?: boolean;
  mockScript?: MockTurn[];
};

export type MockTurn =
  | {
      type: "tool_calls";
      calls: Array<{ name: string; arguments: Record<string, unknown> }>;
      content?: string | null;
    }
  | { type: "final"; content: string };

export type EvalResult = {
  caseId: string;
  name: string;
  pass: boolean;
  checks: Array<{ name: string; pass: boolean; detail?: string }>;
  finalText: string;
  toolsUsed: string[];
  durationMs: number;
  error?: string;
  /** Offline heuristic judge score in [0, 1] (Ch6). */
  judgeScore?: number;
  /** Heuristic judge notes (hits / misses / coverage). */
  judgeNotes?: string[];
};

export type LlmChatRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  signal?: AbortSignal;
};

export type LlmChatResponse = {
  message: ChatMessage;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  raw?: unknown;
};

export type LlmProvider = {
  id: string;
  chat: (req: LlmChatRequest) => Promise<LlmChatResponse>;
};
