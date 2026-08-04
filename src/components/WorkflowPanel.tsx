"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type {
  ActivityItem,
  AgentProfile,
  Priority,
  TaskCard,
  Workflow,
} from "@/lib/types";

const TABS = ["看板", "列表", "工作流", "活动", "设置"] as const;

function SortableCard(props: {
  task: TaskCard;
  agents: AgentProfile[];
  editId: string | null;
  setEditId: (id: string | null) => void;
  onUpdateTask: (taskId: string, patch: Partial<TaskCard>) => void;
  onDeleteTask: (taskId: string) => void;
}) {
  const { task } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: "task", stageId: task.stageId } });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const assignee = props.agents.find((a) => a.id === task.assigneeId);
  const editing = props.editId === task.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-[var(--yxt-border-soft)] bg-white p-3 text-left shadow-sm ${
        isDragging ? "opacity-40" : "hover:border-[var(--yxt-border)]"
      }`}
    >
      <div className="mb-1 flex items-center justify-between text-xs text-[var(--yxt-muted)]">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          # {task.number} · 拖拽
        </button>
        <button
          type="button"
          className="text-[11px] hover:text-rose-600"
          onClick={() => props.onDeleteTask(task.id)}
        >
          删除
        </button>
      </div>
      {editing ? (
        <input
          className="mb-2 w-full rounded border border-[var(--yxt-border-soft)] px-2 py-1 text-[13px]"
          defaultValue={task.title}
          autoFocus
          onBlur={(e) => {
            props.onUpdateTask(task.id, { title: e.target.value });
            props.setEditId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              props.onUpdateTask(task.id, {
                title: (e.target as HTMLInputElement).value,
              });
              props.setEditId(null);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="mb-2 w-full text-left text-[13px] font-medium leading-snug"
          onDoubleClick={() => props.setEditId(task.id)}
        >
          {task.title}
        </button>
      )}
      <p className="mb-3 line-clamp-3 text-[12px] leading-relaxed text-[var(--yxt-muted)]">
        {task.excerpt}
      </p>
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          <select
            className="rounded-md bg-[#fff7ed] px-1.5 py-0.5 text-[#c2410c]"
            value={task.priority}
            onChange={(e) =>
              props.onUpdateTask(task.id, {
                priority: e.target.value as Priority,
              })
            }
          >
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
          <select
            className="max-w-[120px] rounded-md bg-[#f5f6f7] px-1.5 py-0.5"
            value={task.assigneeId}
            onChange={(e) =>
              props.onUpdateTask(task.id, { assigneeId: e.target.value })
            }
          >
            {props.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <span className="text-[var(--yxt-muted)]">{task.updatedAt}</span>
      </div>
      {assignee ? (
        <div className="mt-2 text-[10px] text-[var(--yxt-muted)]">
          {assignee.emoji} {assignee.name}
        </div>
      ) : null}
    </div>
  );
}

function StageColumn(props: {
  stage: Workflow["stages"][number];
  tasks: TaskCard[];
  agents: AgentProfile[];
  editId: string | null;
  setEditId: (id: string | null) => void;
  onAddTask: (stageId: string) => void;
  onUpdateTask: (taskId: string, patch: Partial<TaskCard>) => void;
  onDeleteTask: (taskId: string) => void;
}) {
  const peach = props.stage.tint === "peach";
  const { setNodeRef, isOver } = useDroppable({
    id: `col-${props.stage.id}`,
    data: { type: "column", stageId: props.stage.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-[300px] shrink-0 flex-col rounded-2xl border border-[var(--yxt-border-soft)] ${
        peach ? "bg-[var(--yxt-peach)]/40" : "bg-[#fafbfc]"
      } ${isOver ? "ring-2 ring-indigo-200" : ""}`}
    >
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{
              background: peach
                ? "var(--yxt-peach-dot)"
                : props.stage.humanGate
                  ? "#6366f1"
                  : "var(--yxt-stage-gray)",
            }}
          />
          <h3 className="text-[13px] font-medium">{props.stage.title}</h3>
          {props.stage.humanGate ? (
            <span className="rounded bg-indigo-50 px-1 text-[10px] text-indigo-600">
              人工
            </span>
          ) : null}
        </div>
        <span className="text-xs text-[var(--yxt-muted)]">{props.tasks.length}</span>
      </div>
      <SortableContext
        items={props.tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
          {props.tasks.map((task) => (
            <SortableCard
              key={task.id}
              task={task}
              agents={props.agents}
              editId={props.editId}
              setEditId={props.setEditId}
              onUpdateTask={props.onUpdateTask}
              onDeleteTask={props.onDeleteTask}
            />
          ))}
          <button
            type="button"
            onClick={() => props.onAddTask(props.stage.id)}
            className="mt-auto flex items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--yxt-border)] py-2.5 text-[13px] text-[var(--yxt-muted)] hover:bg-white"
          >
            + 新建任务
          </button>
        </div>
      </SortableContext>
    </div>
  );
}

function WorkflowGraph({ workflow }: { workflow: Workflow }) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = workflow.stages.map((s, i) => {
      const count = workflow.tasks.filter((t) => t.stageId === s.id).length;
      return {
        id: s.id,
        position: { x: i * 200, y: s.humanGate ? 80 : 40 },
        data: {
          label: `${s.title}${s.humanGate ? " · 人工" : ""}\n${count} 任务`,
        },
        style: {
          border: s.humanGate ? "1.5px solid #818cf8" : "1px solid #e8ebed",
          borderRadius: 12,
          padding: 10,
          fontSize: 12,
          background: s.humanGate ? "#eef2ff" : "#fff",
          width: 150,
          whiteSpace: "pre-line" as const,
        },
      };
    });
    const edges: Edge[] = workflow.stages.slice(0, -1).map((s, i) => ({
      id: `e-${s.id}-${workflow.stages[i + 1].id}`,
      source: s.id,
      target: workflow.stages[i + 1].id,
      animated: Boolean(workflow.stages[i + 1].humanGate),
      style: { stroke: "#c8cdd1" },
    }));
    return { nodes, edges };
  }, [workflow]);

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-xl border border-[var(--yxt-border-soft)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background gap={16} size={1} color="#e8ebed" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-[#f7f8f9]" />
      </ReactFlow>
    </div>
  );
}

export function WorkflowPanel(props: {
  workflow: Workflow;
  agents: AgentProfile[];
  activity: ActivityItem[];
  onAddTask: (stageId: string) => void;
  onMoveTask: (taskId: string, stageId: string) => void;
  onUpdateTask: (taskId: string, patch: Partial<TaskCard>) => void;
  onDeleteTask: (taskId: string) => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("看板");
  const [editId, setEditId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const activeTask = activeId
    ? props.workflow.tasks.find((t) => t.id === activeId)
    : null;

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const taskId = String(active.id);
    const overId = String(over.id);
    let stageId: string | undefined;
    if (overId.startsWith("col-")) {
      stageId = overId.slice(4);
    } else {
      const overTask = props.workflow.tasks.find((t) => t.id === overId);
      stageId = overTask?.stageId;
      const dataStage = over.data.current?.stageId as string | undefined;
      if (dataStage) stageId = dataStage;
    }
    const from = props.workflow.tasks.find((t) => t.id === taskId)?.stageId;
    if (stageId && stageId !== from) {
      props.onMoveTask(taskId, stageId);
    }
  };

  return (
    <aside className="flex h-full min-w-0 flex-1 flex-col border-l border-[var(--yxt-border-soft)] bg-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--yxt-border-soft)] px-4 text-xs text-[var(--yxt-muted)]">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{props.workflow.path}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>创建于 工作区</span>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 to-violet-500 text-[10px] text-white">
            奕
          </span>
        </div>
      </header>

      <div className="flex items-center gap-2 px-5 pt-4">
        <h1 className="text-lg font-semibold tracking-tight">{props.workflow.title}</h1>
        <span className="text-[var(--yxt-muted)]">›</span>
      </div>

      <div className="mt-3 flex items-center justify-between border-b border-[var(--yxt-border-soft)] px-5">
        <div className="flex gap-4" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`relative pb-3 text-[13px] ${
                tab === t
                  ? "font-medium text-[var(--yxt-ink)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[var(--yxt-ink)]"
                  : "text-[var(--yxt-muted)] hover:text-[var(--yxt-ink)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button type="button" className="pb-3 text-[13px] text-[var(--yxt-muted)]">
          所有负责人 ▾
        </button>
      </div>

      <div className="yxt-scroll min-h-0 flex-1 overflow-auto p-4">
        {tab === "看板" ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <div className="flex h-full gap-3">
              {props.workflow.stages.map((stage) => {
                const tasks = props.workflow.tasks.filter(
                  (t) => t.stageId === stage.id,
                );
                return (
                  <StageColumn
                    key={stage.id}
                    stage={stage}
                    tasks={tasks}
                    agents={props.agents}
                    editId={editId}
                    setEditId={setEditId}
                    onAddTask={props.onAddTask}
                    onUpdateTask={props.onUpdateTask}
                    onDeleteTask={props.onDeleteTask}
                  />
                );
              })}
            </div>
            <DragOverlay>
              {activeTask ? (
                <div className="w-[280px] rounded-xl border border-indigo-200 bg-white p-3 shadow-lg">
                  <div className="text-xs text-[var(--yxt-muted)]">
                    # {activeTask.number}
                  </div>
                  <div className="text-[13px] font-medium">{activeTask.title}</div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : tab === "列表" ? (
          <table className="w-full text-left text-[13px]">
            <thead className="text-[var(--yxt-muted)]">
              <tr className="border-b border-[var(--yxt-border-soft)]">
                <th className="py-2 font-medium">标题</th>
                <th className="py-2 font-medium">阶段</th>
                <th className="py-2 font-medium">负责人</th>
                <th className="py-2 font-medium">优先级</th>
              </tr>
            </thead>
            <tbody>
              {props.workflow.tasks.map((t) => (
                <tr key={t.id} className="border-b border-[var(--yxt-border-soft)]">
                  <td className="py-2.5">
                    #{t.number} {t.title}
                  </td>
                  <td className="py-2.5">
                    <select
                      className="rounded border border-[var(--yxt-border-soft)] px-1 py-0.5"
                      value={t.stageId}
                      onChange={(e) => props.onMoveTask(t.id, e.target.value)}
                    >
                      {props.workflow.stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5">
                    {props.agents.find((a) => a.id === t.assigneeId)?.name}
                  </td>
                  <td className="py-2.5">{t.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : tab === "工作流" ? (
          <div className="space-y-4 p-1">
            <p className="text-[13px] text-[var(--yxt-muted)]">
              @xyflow/react 阶段图 · 人工门禁高亮 · 本地 CLI 执行策略
            </p>
            <WorkflowGraph workflow={props.workflow} />
          </div>
        ) : tab === "活动" ? (
          <ul className="relative space-y-0 pl-4 text-[13px]">
            <span className="absolute bottom-2 left-[7px] top-2 w-px bg-[var(--yxt-border-soft)]" />
            {props.activity.map((a) => (
              <li key={a.id} className="relative mb-3 pl-4">
                <span className="absolute left-[-1px] top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-400 shadow-sm" />
                <div className="rounded-xl border border-[var(--yxt-border-soft)] p-3">
                  <div className="text-[11px] text-[var(--yxt-muted)]">{a.at}</div>
                  <div className="mt-0.5">{a.text}</div>
                </div>
              </li>
            ))}
            {props.activity.length === 0 ? (
              <li className="pl-4 text-[var(--yxt-muted)]">暂无活动</li>
            ) : null}
          </ul>
        ) : (
          <div className="max-w-lg space-y-4 text-[13px]">
            <div>
              <div className="mb-1 font-medium">工作流名称</div>
              <input
                className="w-full rounded-lg border border-[var(--yxt-border-soft)] px-3 py-2"
                defaultValue={props.workflow.title}
                readOnly
              />
            </div>
            <div>
              <div className="mb-1 font-medium">路径</div>
              <div className="text-[var(--yxt-muted)]">{props.workflow.path}</div>
            </div>
            <div>
              <div className="mb-1 font-medium">本地执行策略（YXT Δ）</div>
              <p className="text-[var(--yxt-muted)]">
                阶段执行绑定 teammate 的 CLI profile，不走 Moxt Credits / 云端模型。
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
