export type NavKey =
  | "chat"
  | "workspace"
  | "members"
  | "workflows"
  | "skills"
  | "automation"
  | "integrations"
  | "hub"
  | "inbox"
  | "settings";

export type AgentProfile = {
  id: string;
  name: string;
  role: string;
  color: string;
  emoji: string;
  cliId: string;
  pinned?: boolean;
  shared?: boolean;
};

export type CliProfile = {
  id: string;
  label: string;
  command: string;
  args: string[];
  description: string;
  available?: boolean;
};

export type ToolStep = {
  id: string;
  kind: "think" | "skill" | "read" | "mcp" | "cli" | "log";
  label: string;
  detail?: string;
  open?: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  agentId?: string;
  content: string;
  steps?: ToolStep[];
  createdAt: string;
};

export type Conversation = {
  id: string;
  title: string;
  agentId: string;
  updatedAt: string;
  messages: ChatMessage[];
  contextFileId?: string;
};

export type Priority = "high" | "medium" | "low";

export type TaskCard = {
  id: string;
  number: number;
  title: string;
  excerpt: string;
  stageId: string;
  priority: Priority;
  assigneeId: string;
  updatedAt: string;
};

export type Stage = {
  id: string;
  title: string;
  tint?: "default" | "peach" | "mint";
  humanGate?: boolean;
};

export type Workflow = {
  id: string;
  title: string;
  path: string;
  stages: Stage[];
  tasks: TaskCard[];
};

export type WorkspaceFile = {
  id: string;
  name: string;
  path: string;
  kind: "md" | "workflow" | "folder" | "html" | "csv" | "file";
  content?: string;
};

export type SkillItem = {
  id: string;
  name: string;
  description: string;
  agentId: string;
  enabled: boolean;
  scope: "agent" | "team";
};

export type CronJob = {
  id: string;
  name: string;
  schedule: string;
  agentId: string;
  prompt: string;
  enabled: boolean;
  lastRun?: string;
};

export type Integration = {
  id: string;
  name: string;
  category: string;
  description: string;
  configured: boolean;
  config?: Record<string, string>;
};

export type HubTemplate = {
  id: string;
  tab: "workflow" | "miniapp" | "teammate" | "html" | "skill";
  title: string;
  category: string;
  description: string;
  installed: boolean;
};

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  kind: "approval" | "mention" | "system";
  done: boolean;
  createdAt: string;
};

export type ActivityItem = {
  id: string;
  text: string;
  at: string;
};

export type AppState = {
  agents: AgentProfile[];
  conversations: Conversation[];
  activeConvId: string;
  activeAgentId: string;
  selectedCliId: string;
  workflow: Workflow;
  skills: SkillItem[];
  crons: CronJob[];
  integrations: Integration[];
  hub: HubTemplate[];
  inbox: InboxItem[];
  activity: ActivityItem[];
  clis: CliProfile[];
};
