import type {
  AgentProfile,
  AppState,
  CliProfile,
  Conversation,
  CronJob,
  HubTemplate,
  InboxItem,
  Integration,
  SkillItem,
  Workflow,
} from "./types";

export const CLI_PROFILES: CliProfile[] = [
  {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    args: ["-p", "--output-format", "text"],
    description: "本机 Claude Code CLI",
  },
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    args: ["exec"],
    description: "本机 OpenAI Codex CLI",
  },
  {
    id: "echo",
    label: "Echo (dev)",
    command: "echo",
    args: [],
    description: "开发回环 / CLI 不可用时的保底",
  },
];

export const AGENTS: AgentProfile[] = [
  {
    id: "momo",
    name: "奕枢's momo",
    role: "个人 AI 同事 · 编排与上下文",
    color: "#f472b6",
    emoji: "✦",
    cliId: "claude",
    pinned: true,
  },
  {
    id: "prd-reviewer",
    name: "PRD 评审员",
    role: "独立评审 PRD 完整性、规范与逻辑一致性。检查问题定义、范围、non-goals、验收标准等。",
    color: "#fb923c",
    emoji: "◎",
    cliId: "claude",
  },
  {
    id: "prd-writer",
    name: "PRD 撰写员",
    role: "负责 PRD 起草和 BDD Use Case 编写。根据需求输入撰写结构化 PRD。",
    color: "#4ade80",
    emoji: "✎",
    cliId: "claude",
  },
  {
    id: "delivery",
    name: "交付推进员",
    role: "负责产品交付流程的推进、开发状态同步、交付收尾 handoff。",
    color: "#60a5fa",
    emoji: "→",
    cliId: "codex",
  },
];

export const WORKFLOW: Workflow = {
  id: "prd-spec",
  title: "PRD - Spec 评审",
  path: "General / PRD - Spec 评审 / PRD - Spec 评审.workflow",
  stages: [
    { id: "draft", title: "PRD 起草", tint: "default" },
    { id: "ai-review", title: "AI 评审", tint: "peach" },
    { id: "pm-review", title: "PM 评审", tint: "default", humanGate: true },
    { id: "bdd", title: "BDD 编写", tint: "default" },
    { id: "owner", title: "Owner 审批", tint: "default", humanGate: true },
    { id: "dev", title: "开发中", tint: "default" },
    { id: "shipped", title: "已交付", tint: "mint", humanGate: true },
    { id: "closed", title: "已关闭", tint: "default" },
    { id: "wont", title: "不做了", tint: "default" },
  ],
  tasks: [
    {
      id: "t1",
      number: 1,
      title: "通知中心重设计 PRD",
      excerpt:
        "## 需求背景 当前通知系统对高频用户每日推送 40+ 条通知且无优先级区分，导致通知疲劳和 23% 退订率。需重设计通知中心支持分组、静音和统一偏好面…",
      stageId: "ai-review",
      priority: "high",
      assigneeId: "prd-reviewer",
      updatedAt: "刚刚",
    },
    {
      id: "t2",
      number: 2,
      title: "示例 · 登录重定向修复",
      excerpt: "占位样本 Task，可删除或拖到其他阶段。",
      stageId: "pm-review",
      priority: "medium",
      assigneeId: "momo",
      updatedAt: "稍早",
    },
  ],
};

export const SEED_CONVERSATION: Conversation = {
  id: "c-init",
  title: "初始化评审工作流",
  agentId: "momo",
  updatedAt: "今天",
  contextFileId: "wf-prd",
  messages: [
    {
      id: "m1",
      role: "user",
      content: "请阅读同级的 workflow.md 文件，帮我初始化这个工作流。",
      createdAt: "3:31",
    },
    {
      id: "m2",
      role: "assistant",
      agentId: "momo",
      createdAt: "3:31",
      steps: [
        { id: "s1", kind: "think", label: "思考中" },
        { id: "s2", kind: "skill", label: "Skill: yxt-workflow" },
        { id: "s3", kind: "read", label: "读取：", detail: "workflow.md" },
        { id: "s4", kind: "mcp", label: "Local Workflow: get-workflow" },
        { id: "s5", kind: "mcp", label: "Local Workflow Task: list-tasks" },
      ],
      content: `我已阅读了同级的 \`workflow.md\`，并查看了这个工作流当前的状态设计——它已经按模板搭建好了 9 个阶段（PRD 起草 → AI 评审 → PM 评审 → BDD 编写 → Owner 审批 → 开发中 → 已交付 / 已关闭 / 不做了），并配好了 teammate 负责人。

在为你创建真正的第一个 Task 之前，按 workflow.md 的「定制项清单」，我需要先确认几项信息：

1. **产品事项**：你要推进的具体产品需求是什么？
2. **PRD 作者**：这份 PRD 由谁负责起草？
3. **PM 评审人**：PM 评审阶段由谁来审？
4. **Owner（终审人）**：最终拍板人是谁？

先确认这四项，我再继续。`,
    },
  ],
};

export const SKILLS: SkillItem[] = [
  {
    id: "sk-wf",
    name: "yxt-workflow",
    description: "工作流编排与阶段推进、任务创建",
    agentId: "momo",
    enabled: true,
    scope: "agent",
  },
  {
    id: "sk-research",
    name: "deep-research-pro",
    description: "Multi-source deep research. Synthesizes findings with citations.",
    agentId: "momo",
    enabled: true,
    scope: "agent",
  },
  {
    id: "sk-human",
    name: "humanizer",
    description: "Remove AI-writing tells; make text sound natural.",
    agentId: "prd-writer",
    enabled: true,
    scope: "agent",
  },
  {
    id: "sk-team-voice",
    name: "brand-voice",
    description: "团队统一话术与语气",
    agentId: "momo",
    enabled: false,
    scope: "team",
  },
];

export const CRONS: CronJob[] = [];

export const INTEGRATIONS: Integration[] = [
  {
    id: "mcp",
    name: "MCP Server",
    category: "开发者",
    description: "接入任意 MCP 兼容工具",
    configured: false,
    config: { command: "", args: "" },
  },
  {
    id: "custom-api",
    name: "Custom API",
    category: "开发者",
    description: "任意 REST API，一次配置",
    configured: false,
    config: { baseUrl: "", apiKey: "" },
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "消息",
    description: "Read, draft, and send emails（需用户自备 OAuth/token）",
    configured: false,
    config: { token: "" },
  },
  {
    id: "slack",
    name: "Slack",
    category: "消息",
    description: "让 agent 驻扎聊天界面",
    configured: false,
    config: { webhook: "" },
  },
  {
    id: "github",
    name: "GitHub",
    category: "开发者",
    description: "Issues / PR 上下文",
    configured: false,
    config: { token: "", repo: "" },
  },
  {
    id: "local-cli",
    name: "Local CLI Agents",
    category: "AI",
    description: "YXT 主路径：claude / codex / 自定义命令",
    configured: true,
    config: { default: "claude" },
  },
];

export const HUB: HubTemplate[] = [
  {
    id: "hub-prd",
    tab: "workflow",
    title: "PRD - Spec 评审",
    category: "产品",
    description: "九阶段 PRD 起草→评审→BDD→交付，含人工门禁。",
    installed: true,
  },
  {
    id: "hub-kol",
    tab: "workflow",
    title: "跨部门需求分派",
    category: "运营与行政",
    description: "分拣 Agent 判定类型与优先级，人工仅审高风险场景。",
    installed: false,
  },
  {
    id: "hub-content",
    tab: "workflow",
    title: "Blog Writing Pipeline",
    category: "内容",
    description: "四 agents 接力：选题→撰写→评审→发布。",
    installed: false,
  },
  {
    id: "hub-kanban",
    tab: "miniapp",
    title: "看板",
    category: "看板",
    description: "适配任意工作流的灵活看板。",
    installed: false,
  },
  {
    id: "hub-crm",
    tab: "miniapp",
    title: "DataTable for CRM",
    category: "销售",
    description: "客户阶段、金额、负责人一张表。",
    installed: false,
  },
  {
    id: "hub-social",
    tab: "teammate",
    title: "Social Media Manager",
    category: "增长",
    description: "草稿推文、日历、跨平台改写。",
    installed: false,
  },
  {
    id: "hub-html",
    tab: "html",
    title: "Weekly roadmap",
    category: "模板",
    description: "周报 Markdown/HTML 模板。",
    installed: false,
  },
  {
    id: "hub-skill",
    tab: "skill",
    title: "marketing-mode",
    category: "技能",
    description: "23 项营销技能合集。",
    installed: false,
  },
];

export const INBOX: InboxItem[] = [
  {
    id: "in1",
    title: "PM 评审待你处理",
    body: "任务「示例 · 登录重定向修复」已进入 PM 评审（human gate）。",
    kind: "approval",
    done: false,
    createdAt: "刚刚",
  },
  {
    id: "in2",
    title: "momo 提到了你",
    body: "初始化评审工作流：请确认产品事项与 Owner。",
    kind: "mention",
    done: false,
    createdAt: "稍早",
  },
];

export function buildInitialState(): AppState {
  return {
    agents: AGENTS,
    conversations: [SEED_CONVERSATION],
    activeConvId: SEED_CONVERSATION.id,
    activeAgentId: SEED_CONVERSATION.agentId,
    selectedCliId: "claude",
    workflow: WORKFLOW,
    skills: SKILLS,
    crons: CRONS,
    integrations: INTEGRATIONS,
    hub: HUB,
    inbox: INBOX,
    activity: [
      {
        id: "a1",
        text: "PRD 评审员 · 任务「通知中心重设计 PRD」进入 AI 评审",
        at: "刚刚",
      },
      {
        id: "a2",
        text: "momo · 初始化工作流模板（9 阶段）",
        at: "稍早",
      },
    ],
    clis: CLI_PROFILES,
  };
}

export const STORAGE_KEY = "yxt-app-state-v2";
