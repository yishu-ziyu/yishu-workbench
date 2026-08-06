import fs from "node:fs";
import path from "node:path";
import type { ToolSpec } from "../types";
import { canEnterStage } from "../gates";
import { workflowStatePath } from "../paths";
import { pushInbox } from "./collab-tools";
import { parseArgsObject } from "./registry";

export type WfStage = {
  id: string;
  title: string;
  humanGate?: boolean;
};

export type WfTask = {
  id: string;
  number: number;
  title: string;
  excerpt: string;
  stageId: string;
  priority: "high" | "medium" | "low";
  assigneeId: string;
  updatedAt: string;
};

export type WorkflowState = {
  id: string;
  title: string;
  path: string;
  stages: WfStage[];
  tasks: WfTask[];
};

const DEFAULT_STATE: WorkflowState = {
  id: "prd-spec",
  title: "PRD - Spec 评审",
  path: "General / PRD - Spec 评审 / PRD - Spec 评审.workflow",
  stages: [
    { id: "draft", title: "PRD 起草" },
    { id: "ai-review", title: "AI 评审" },
    { id: "pm-review", title: "PM 评审", humanGate: true },
    { id: "bdd", title: "BDD 编写" },
    { id: "owner", title: "Owner 审批", humanGate: true },
    { id: "dev", title: "开发中" },
    { id: "shipped", title: "已交付", humanGate: true },
    { id: "closed", title: "已关闭" },
    { id: "wont", title: "不做了" },
  ],
  tasks: [],
};

export function loadWorkflow(workspaceRoot: string): WorkflowState {
  const p = workflowStatePath(workspaceRoot);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(DEFAULT_STATE, null, 2), "utf8");
    return structuredClone(DEFAULT_STATE);
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as WorkflowState;
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

export function saveWorkflow(workspaceRoot: string, state: WorkflowState): void {
  const p = workflowStatePath(workspaceRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2), "utf8");
}

export function createWorkflowTools(): ToolSpec[] {
  return [
    {
      category: "perceive",
      definition: {
        type: "function",
        function: {
          name: "workflow_get",
          description:
            "Get PRD-Spec workflow state: stages (with human gates) and all tasks. Business core tool for 奕枢工作台.",
          parameters: { type: "object", properties: {} },
        },
      },
      handler: (_args, ctx) => {
        const wf = loadWorkflow(ctx.workspaceRoot);
        return JSON.stringify({ ok: true, workflow: wf });
      },
    },
    {
      category: "perceive",
      definition: {
        type: "function",
        function: {
          name: "workflow_list_human_gates",
          description:
            "List workflow stages that require human approval (humanGate=true), plus task counts currently waiting on each gate. Use before advancing stages or explaining HITL bottlenecks.",
          parameters: { type: "object", properties: {} },
        },
      },
      handler: (_args, ctx) => {
        const wf = loadWorkflow(ctx.workspaceRoot);
        const gates = wf.stages
          .filter((s) => s.humanGate)
          .map((s) => {
            const waiting = wf.tasks.filter((t) => t.stageId === s.id);
            return {
              stageId: s.id,
              title: s.title,
              humanGate: true as const,
              waitingCount: waiting.length,
              waitingTaskIds: waiting.map((t) => t.id),
              waitingTitles: waiting.map((t) => t.title),
            };
          });
        return JSON.stringify({
          ok: true,
          count: gates.length,
          gates,
          stageIds: gates.map((g) => g.stageId),
        });
      },
    },
    {
      category: "execute",
      definition: {
        type: "function",
        function: {
          name: "workflow_create_task",
          description:
            "Create a new task on the PRD-Spec board. Use when user confirmed product matter / authors.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              excerpt: { type: "string" },
              stageId: {
                type: "string",
                description: "Stage id, default draft",
              },
              priority: {
                type: "string",
                enum: ["high", "medium", "low"],
              },
              assigneeId: {
                type: "string",
                description: "Agent id: momo | prd-writer | prd-reviewer | delivery",
              },
            },
            required: ["title"],
          },
        },
      },
      handler: (args, ctx) => {
        const title = parseArgsObject(args, "title");
        if (!title) return JSON.stringify({ ok: false, error: "title required" });
        const wf = loadWorkflow(ctx.workspaceRoot);
        const stageId = parseArgsObject(args, "stageId", "draft") || "draft";
        if (!wf.stages.some((s) => s.id === stageId)) {
          return JSON.stringify({
            ok: false,
            error: `unknown stageId ${stageId}`,
            stages: wf.stages.map((s) => s.id),
          });
        }
        const priority = (parseArgsObject(args, "priority", "medium") ||
          "medium") as WfTask["priority"];
        const task: WfTask = {
          id: `t-${Date.now()}`,
          number: wf.tasks.length + 1,
          title,
          excerpt: parseArgsObject(args, "excerpt", title.slice(0, 80)),
          stageId,
          priority: ["high", "medium", "low"].includes(priority)
            ? priority
            : "medium",
          assigneeId: parseArgsObject(args, "assigneeId", ctx.agentId) || ctx.agentId,
          updatedAt: new Date().toISOString(),
        };
        wf.tasks.push(task);
        saveWorkflow(ctx.workspaceRoot, wf);
        return JSON.stringify({ ok: true, task });
      },
    },
    {
      category: "execute",
      definition: {
        type: "function",
        function: {
          name: "workflow_move_task",
          description:
            "Move a task to another stage. When moving INTO a humanGate stage, auto-pushes an approval item to the human inbox.",
          parameters: {
            type: "object",
            properties: {
              taskId: { type: "string" },
              stageId: { type: "string" },
            },
            required: ["taskId", "stageId"],
          },
        },
      },
      handler: (args, ctx) => {
        const taskId = parseArgsObject(args, "taskId");
        const stageId = parseArgsObject(args, "stageId");
        const wf = loadWorkflow(ctx.workspaceRoot);
        const task = wf.tasks.find((t) => t.id === taskId);
        if (!task) return JSON.stringify({ ok: false, error: "task not found" });
        const stage = wf.stages.find((s) => s.id === stageId);
        if (!stage) {
          return JSON.stringify({
            ok: false,
            error: "stage not found",
            stages: wf.stages.map((s) => s.id),
          });
        }
        const gate = canEnterStage(wf, task, stageId);
        if (!gate.ok) {
          return JSON.stringify({
            ok: false,
            error: gate.reason || "stage transition blocked",
          });
        }
        const from = task.stageId;
        task.stageId = stageId;
        task.updatedAt = new Date().toISOString();
        saveWorkflow(ctx.workspaceRoot, wf);

        const isGate = !!stage.humanGate;
        if (isGate) {
          pushInbox(ctx.workspaceRoot, {
            title: `「${task.title}」待你处理 · ${stage.title}`,
            body: [
              `taskId: ${task.id}`,
              `stage: ${stage.id} (${stage.title})`,
              `from: ${from}`,
              task.excerpt ? `excerpt: ${task.excerpt}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
            kind: "approval",
          });
        }

        return JSON.stringify({
          ok: true,
          task,
          from,
          to: stageId,
          humanGate: isGate,
          ...(isGate ? { autoInbox: true } : {}),
          hint: isGate
            ? "Human gate: approval inbox item auto-pushed"
            : undefined,
        });
      },
    },
    {
      category: "execute",
      definition: {
        type: "function",
        function: {
          name: "workflow_update_task",
          description: "Update task title, excerpt, priority, or assignee.",
          parameters: {
            type: "object",
            properties: {
              taskId: { type: "string" },
              title: { type: "string" },
              excerpt: { type: "string" },
              priority: { type: "string", enum: ["high", "medium", "low"] },
              assigneeId: { type: "string" },
            },
            required: ["taskId"],
          },
        },
      },
      handler: (args, ctx) => {
        const taskId = parseArgsObject(args, "taskId");
        const wf = loadWorkflow(ctx.workspaceRoot);
        const task = wf.tasks.find((t) => t.id === taskId);
        if (!task) return JSON.stringify({ ok: false, error: "task not found" });
        if (typeof args.title === "string") task.title = args.title;
        if (typeof args.excerpt === "string") task.excerpt = args.excerpt;
        if (typeof args.priority === "string") {
          task.priority = args.priority as WfTask["priority"];
        }
        if (typeof args.assigneeId === "string") task.assigneeId = args.assigneeId;
        task.updatedAt = new Date().toISOString();
        saveWorkflow(ctx.workspaceRoot, wf);
        return JSON.stringify({ ok: true, task });
      },
    },
  ];
}
