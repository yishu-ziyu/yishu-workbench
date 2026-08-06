"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { IconRail } from "./IconRail";
import { ChatSidebar } from "./ChatSidebar";
import { ChatPanel } from "./ChatPanel";
import { WorkflowPanel } from "./WorkflowPanel";
import { SecondaryPanels } from "./SecondaryPanels";
import { STORAGE_KEY, buildInitialState } from "@/lib/seed";
import type {
  AgentProfile,
  AppState,
  ChatMessage,
  CliProfile,
  Conversation,
  CronJob,
  NavKey,
  TaskCard,
  ToolStep,
  Workflow,
} from "@/lib/types";

function loadState(): AppState {
  if (typeof window === "undefined") return buildInitialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildInitialState();
    const parsed = JSON.parse(raw) as AppState;
    const base = buildInitialState();
    return {
      ...base,
      ...parsed,
      workflow: parsed.workflow || base.workflow,
      agents: parsed.agents?.length ? parsed.agents : base.agents,
      conversations: parsed.conversations?.length
        ? parsed.conversations
        : base.conversations,
    };
  } catch {
    return buildInitialState();
  }
}

/** Disk SSOT via API; localStorage remains cache only. */
function persistWorkflow(workflow: Workflow) {
  void fetch("/api/workspace/workflow", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow }),
  }).catch(() => {});
}

/** Merge disk workflow into UI shape; keep stage tints from local when disk omits them. */
function mergeWorkflowFromDisk(disk: Workflow, local: Workflow): Workflow {
  const tintById = new Map(
    local.stages.map((s) => [s.id, s.tint] as const),
  );
  return {
    ...disk,
    stages: disk.stages.map((s) => ({
      ...s,
      tint: s.tint ?? tintById.get(s.id),
    })),
    tasks: Array.isArray(disk.tasks) ? disk.tasks : local.tasks,
  };
}

/** Map tool name → UI step kind (mirrors agent loop heuristics). */
function toolStepKind(name: string): ToolStep["kind"] {
  const n = name.toLowerCase();
  if (n.startsWith("read") || n.includes("search") || n.includes("list")) {
    return "read";
  }
  if (n.includes("skill") || n === "load_skill") return "skill";
  if (
    n.includes("workflow") ||
    n.includes("handoff") ||
    n.includes("inbox") ||
    n.includes("memory")
  ) {
    return "mcp";
  }
  return "cli";
}

/** Multi when momo + collab keywords; otherwise auto (agent if LLM, else CLI). */
function resolveRunMode(
  agentId: string,
  prompt: string,
): "auto" | "multi" {
  if (
    agentId === "momo" &&
    /协作|handoff|评审流水线/i.test(prompt)
  ) {
    return "multi";
  }
  return "auto";
}

export function WorkspaceApp() {
  const [ready, setReady] = useState(false);
  const [nav, setNav] = useState<NavKey>("chat");
  const [state, setState] = useState<AppState>(buildInitialState);
  const [streaming, setStreaming] = useState(false);
  const [liveSteps, setLiveSteps] = useState<ToolStep[]>([]);
  const [liveText, setLiveText] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const initial = loadState();
    setState(initial);
    setReady(true);
    // Disk SSOT: prefer workspace/.agent/workflow-state.json over seed/cache
    void fetch("/api/workspace/workflow")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: { ok?: boolean; workflow?: Workflow } | null) => {
          if (!d?.ok || !d.workflow) return;
          setState((s) => ({
            ...s,
            workflow: mergeWorkflowFromDisk(d.workflow!, s.workflow),
          }));
        },
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, ready]);

  useEffect(() => {
    void fetch("/api/cli/list")
      .then((r) => r.json())
      .then((d: { clis: CliProfile[] }) => {
        if (!d.clis?.length) return;
        setState((s) => {
          const byId = new Map(d.clis.map((c) => [c.id, c]));
          const merged: CliProfile[] = s.clis.map((c) => ({
            ...c,
            available: byId.get(c.id)?.available ?? c.available,
          }));
          for (const c of d.clis) {
            if (!merged.find((m) => m.id === c.id)) {
              merged.push({ ...c });
            }
          }
          return { ...s, clis: merged };
        });
      })
      .catch(() => {});
  }, []);

  const activeConv =
    state.conversations.find((c) => c.id === state.activeConvId) ||
    state.conversations[0];

  const pushActivity = useCallback((text: string) => {
    setState((s) => ({
      ...s,
      activity: [
        {
          id: `act-${Date.now()}`,
          text,
          at: "刚刚",
        },
        ...s.activity,
      ].slice(0, 50),
    }));
  }, []);

  const onStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const onSend = useCallback(
    async (text: string) => {
      // Prior messages only (new user turn goes in prompt, not history).
      const priorHistory = (activeConv?.messages || [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      const agentId = state.activeAgentId;
      const conversationId = state.activeConvId;
      const mode = resolveRunMode(agentId, text);

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
        createdAt: new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setState((s) => ({
        ...s,
        conversations: s.conversations.map((c) =>
          c.id === s.activeConvId
            ? {
                ...c,
                title:
                  c.messages.length === 0
                    ? text.slice(0, 24) || c.title
                    : c.title,
                messages: [...c.messages, userMsg],
              }
            : c,
        ),
      }));

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setStreaming(true);
      setLiveSteps([]);
      setLiveText("");

      const cliId = state.selectedCliId || "echo";
      const cliProfile = state.clis.find((c) => c.id === cliId);
      const steps: ToolStep[] = [];
      /** callId → index in steps (for tool_end detail updates) */
      const toolStepIndex = new Map<string, number>();
      let full = "";
      let aborted = false;

      const bumpSteps = () => setLiveSteps([...steps]);

      try {
        const res = await fetch("/api/agent/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ac.signal,
          body: JSON.stringify({
            prompt: text,
            mode,
            agentId,
            conversationId,
            history: priorHistory,
            cliId,
            cli: cliProfile
              ? {
                  id: cliProfile.id,
                  label: cliProfile.label,
                  command: cliProfile.command,
                  args: cliProfile.args,
                }
              : null,
            cwd:
              `${process.env.NEXT_PUBLIC_WORKSPACE_CWD || ""}`.trim() ||
              undefined,
          }),
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const ev = JSON.parse(line) as {
              type: string;
              kind?: string;
              label?: string;
              detail?: string;
              text?: string;
              message?: string;
              name?: string;
              args?: unknown;
              callId?: string;
              result?: string;
              finalText?: string;
              exitCode?: number;
            };

            if (ev.type === "step") {
              // Skip backend Tool: echoes — tool_start owns those steps.
              if ((ev.label || "").startsWith("Tool:")) continue;
              const step: ToolStep = {
                id: `s-${Date.now()}-${steps.length}`,
                kind: (ev.kind as ToolStep["kind"]) || "log",
                label: ev.label || "",
                detail: ev.detail,
              };
              steps.push(step);
              bumpSteps();
            } else if (ev.type === "tool_start") {
              const name = ev.name || "tool";
              const kind = toolStepKind(name);
              const detail =
                ev.args !== undefined
                  ? typeof ev.args === "object"
                    ? JSON.stringify(ev.args).slice(0, 200)
                    : String(ev.args).slice(0, 200)
                  : undefined;
              const step: ToolStep = {
                id: ev.callId ? `tool-${ev.callId}` : `s-${Date.now()}-${steps.length}`,
                kind,
                label: `Tool: ${name}`,
                detail,
              };
              if (ev.callId) toolStepIndex.set(ev.callId, steps.length);
              steps.push(step);
              bumpSteps();
            } else if (ev.type === "tool_end") {
              const idx =
                ev.callId !== undefined
                  ? toolStepIndex.get(ev.callId)
                  : undefined;
              const resultPreview = (ev.result || "").slice(0, 400);
              if (idx !== undefined && steps[idx]) {
                const prev = steps[idx];
                steps[idx] = {
                  ...prev,
                  detail: resultPreview
                    ? `${prev.detail ? prev.detail + " → " : ""}${resultPreview}`
                    : prev.detail,
                };
                bumpSteps();
              } else if (ev.name) {
                steps.push({
                  id: `s-${Date.now()}-${steps.length}`,
                  kind: toolStepKind(ev.name),
                  label: `Tool done: ${ev.name}`,
                  detail: resultPreview || undefined,
                });
                bumpSteps();
              }
            } else if (ev.type === "status") {
              steps.push({
                id: `s-${Date.now()}-${steps.length}`,
                kind: "log",
                label: ev.text || "status",
              });
              bumpSteps();
            } else if (ev.type === "token") {
              full += ev.text || "";
              setLiveText(full);
            } else if (ev.type === "done") {
              if (!full.trim() && ev.finalText) {
                full = ev.finalText;
                setLiveText(full);
              }
            } else if (ev.type === "error") {
              full += `\n[error] ${ev.message}`;
              setLiveText(full);
            }
          }
        }

        const assistant: ChatMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          agentId,
          content: full.trim() || "（无输出）",
          steps,
          createdAt: new Date().toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        setState((s) => ({
          ...s,
          conversations: s.conversations.map((c) =>
            c.id === s.activeConvId
              ? { ...c, messages: [...c.messages, assistant] }
              : c,
          ),
        }));
        pushActivity(
          `${mode === "multi" ? "multi" : agentId} · ${cliId} · 完成一轮对话`,
        );
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          aborted = true;
          const assistant: ChatMessage = {
            id: `a-${Date.now()}`,
            role: "assistant",
            agentId,
            content: (full.trim() ? `${full.trim()}\n\n` : "") + "（已停止）",
            steps,
            createdAt: new Date().toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          };
          setState((s) => ({
            ...s,
            conversations: s.conversations.map((c) =>
              c.id === s.activeConvId
                ? { ...c, messages: [...c.messages, assistant] }
                : c,
            ),
          }));
          pushActivity(`${cliId} · 用户停止`);
        } else {
          const assistant: ChatMessage = {
            id: `a-${Date.now()}`,
            role: "assistant",
            agentId,
            content: `Agent 调用失败：${e instanceof Error ? e.message : String(e)}`,
            steps,
            createdAt: new Date().toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          };
          setState((s) => ({
            ...s,
            conversations: s.conversations.map((c) =>
              c.id === s.activeConvId
                ? { ...c, messages: [...c.messages, assistant] }
                : c,
            ),
          }));
        }
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
        setStreaming(false);
        setLiveSteps([]);
        setLiveText("");
        void aborted;
      }
    },
    [
      pushActivity,
      state.activeAgentId,
      state.activeConvId,
      state.selectedCliId,
      state.clis,
      activeConv,
    ],
  );

  const onNewChat = () => {
    const id = `c-${Date.now()}`;
    const conv: Conversation = {
      id,
      title: "新对话",
      agentId: state.activeAgentId,
      updatedAt: "今天",
      messages: [],
      contextFileId: "wf-prd",
    };
    setState((s) => ({
      ...s,
      conversations: [conv, ...s.conversations],
      activeConvId: id,
    }));
    setNav("chat");
  };

  const onAddTask = (stageId: string) => {
    setState((s) => {
      const number = s.workflow.tasks.length + 1;
      const task: TaskCard = {
        id: `t-${Date.now()}`,
        number,
        title: "新任务",
        excerpt: "双击标题编辑；拖拽改阶段。",
        stageId,
        priority: "medium",
        assigneeId: s.activeAgentId,
        updatedAt: "刚刚",
      };
      const workflow = {
        ...s.workflow,
        tasks: [...s.workflow.tasks, task],
      };
      persistWorkflow(workflow);
      return { ...s, workflow };
    });
    pushActivity("新建任务");
  };

  const onMoveTask = (taskId: string, stageId: string) => {
    setState((s) => {
      const stage = s.workflow.stages.find((x) => x.id === stageId);
      const workflow = {
        ...s.workflow,
        tasks: s.workflow.tasks.map((t) =>
          t.id === taskId ? { ...t, stageId, updatedAt: "刚刚" } : t,
        ),
      };
      persistWorkflow(workflow);
      return {
        ...s,
        workflow,
        activity: [
          {
            id: `act-${Date.now()}`,
            text: `任务移动到「${stage?.title || stageId}」`,
            at: "刚刚",
          },
          ...s.activity,
        ],
      };
    });
  };

  const onUpdateTask = (taskId: string, patch: Partial<TaskCard>) => {
    setState((s) => {
      const workflow = {
        ...s.workflow,
        tasks: s.workflow.tasks.map((t) =>
          t.id === taskId ? { ...t, ...patch, updatedAt: "刚刚" } : t,
        ),
      };
      persistWorkflow(workflow);
      return { ...s, workflow };
    });
  };

  const onDeleteTask = (taskId: string) => {
    setState((s) => ({
      ...s,
      workflow: {
        ...s.workflow,
        tasks: s.workflow.tasks.filter((t) => t.id !== taskId),
      },
    }));
  };

  const onCreateAgent = (name: string, role: string, cliId: string) => {
    const agent: AgentProfile = {
      id: `ag-${Date.now()}`,
      name,
      role,
      color: "#a78bfa",
      emoji: "◆",
      cliId,
    };
    setState((s) => ({ ...s, agents: [...s.agents, agent] }));
    pushActivity(`创建 AI 同事 ${name}`);
  };

  const onUpdateAgent = (id: string, patch: Partial<AgentProfile>) => {
    setState((s) => ({
      ...s,
      agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
    pushActivity(`更新 AI 同事`);
  };

  const onInstallHub = (id: string) => {
    setState((s) => {
      const item = s.hub.find((h) => h.id === id);
      if (!item) return s;
      let next = {
        ...s,
        hub: s.hub.map((h) => (h.id === id ? { ...h, installed: true } : h)),
      };
      if (item.tab === "teammate") {
        next = {
          ...next,
          agents: [
            ...next.agents,
            {
              id: `hub-${id}`,
              name: item.title,
              role: item.description,
              color: "#34d399",
              emoji: "★",
              cliId: next.selectedCliId || next.clis[0]?.id || "claude",
            },
          ],
        };
      }
      if (item.tab === "skill") {
        next = {
          ...next,
          skills: [
            ...next.skills,
            {
              id: `hub-sk-${id}`,
              name: item.title,
              description: item.description,
              agentId: next.agents[0]?.id || "momo",
              enabled: true,
              scope: "agent",
            },
          ],
        };
      }
      if (item.tab === "workflow" || item.tab === "miniapp" || item.tab === "html") {
        // materialize into workspace via API
        void fetch("/api/workspace/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: `Hub/${item.title.replace(/\s+/g, "-")}.md`,
            content: `# ${item.title}\n\n${item.description}\n\nInstalled from YXT Hub.\n`,
          }),
        });
      }
      return next;
    });
    pushActivity(`安装 Hub 模板`);
  };

  const inboxOpen = state.inbox.filter((i) => !i.done).length;

  const secondary = (
    <SecondaryPanels
      nav={nav}
      agents={state.agents}
      workflow={state.workflow}
      skills={state.skills}
      crons={state.crons}
      integrations={state.integrations}
      hub={state.hub}
      inbox={state.inbox}
      clis={state.clis}
      onCreateAgent={onCreateAgent}
      onUpdateAgent={onUpdateAgent}
      onToggleSkill={(id) =>
        setState((s) => ({
          ...s,
          skills: s.skills.map((sk) =>
            sk.id === id ? { ...sk, enabled: !sk.enabled } : sk,
          ),
        }))
      }
      onAddSkill={(name, description, agentId) =>
        setState((s) => ({
          ...s,
          skills: [
            ...s.skills,
            {
              id: `sk-${Date.now()}`,
              name,
              description,
              agentId,
              enabled: true,
              scope: "agent",
            },
          ],
        }))
      }
      onAddCron={(job: Omit<CronJob, "id">) =>
        setState((s) => ({
          ...s,
          crons: [...s.crons, { ...job, id: `cron-${Date.now()}` }],
        }))
      }
      onToggleCron={(id) =>
        setState((s) => ({
          ...s,
          crons: s.crons.map((c) =>
            c.id === id ? { ...c, enabled: !c.enabled } : c,
          ),
        }))
      }
      onDeleteCron={(id) =>
        setState((s) => ({
          ...s,
          crons: s.crons.filter((c) => c.id !== id),
        }))
      }
      onSaveIntegration={(id, config) =>
        setState((s) => ({
          ...s,
          integrations: s.integrations.map((i) =>
            i.id === id
              ? {
                  ...i,
                  config,
                  configured: Object.values(config).some((v) => v.trim()),
                }
              : i,
          ),
        }))
      }
      onInstallHub={onInstallHub}
      onInboxDone={(id) =>
        setState((s) => ({
          ...s,
          inbox: s.inbox.map((i) =>
            i.id === id ? { ...i, done: true } : i,
          ),
        }))
      }
      onSaveCli={(clis) => setState((s) => ({ ...s, clis }))}
    />
  );

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-[var(--yxt-muted)]">
        Loading YXT…
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-[var(--yxt-ink)]">
      <IconRail active={nav} onChange={setNav} inboxCount={inboxOpen} />
      {nav === "chat" ? (
        /* shell: react-resizable-panels Group · sidebar | chat | workflow */
        <Group orientation="horizontal" className="min-w-0 flex-1">
          <Panel
            id="sessions"
            defaultSize={18}
            minSize={12}
            maxSize={32}
            className="min-w-0"
          >
            <ChatSidebar
              agents={state.agents}
              conversations={state.conversations}
              activeId={state.activeConvId}
              activeAgentId={state.activeAgentId}
              onSelectConversation={(id) =>
                setState((s) => ({ ...s, activeConvId: id }))
              }
              onSelectAgent={(id) => {
                const a = state.agents.find((x) => x.id === id);
                setState((s) => ({
                  ...s,
                  activeAgentId: id,
                  selectedCliId: a?.cliId || s.selectedCliId,
                }));
              }}
              onNewChat={onNewChat}
            />
          </Panel>
          <Separator className="w-1 bg-transparent outline-none hover:bg-indigo-100 data-[separator=active]:bg-indigo-200" />
          <Panel id="chat" defaultSize={42} minSize={28} className="min-w-0">
            <ChatPanel
              conversation={activeConv}
              agents={state.agents}
              clis={state.clis}
              contextLabel="PRD - Spec 评审.workflow"
              selectedCliId={state.selectedCliId}
              onSelectCli={(id) =>
                setState((s) => ({ ...s, selectedCliId: id }))
              }
              onSend={onSend}
              onStop={onStop}
              streaming={streaming}
              liveSteps={liveSteps}
              liveText={liveText}
            />
          </Panel>
          <Separator className="w-1 bg-transparent outline-none hover:bg-indigo-100 data-[separator=active]:bg-indigo-200" />
          <Panel id="workflow" defaultSize={40} minSize={24} className="min-w-0">
            <WorkflowPanel
              workflow={state.workflow}
              agents={state.agents}
              activity={state.activity}
              onAddTask={onAddTask}
              onMoveTask={onMoveTask}
              onUpdateTask={onUpdateTask}
              onDeleteTask={onDeleteTask}
            />
          </Panel>
        </Group>
      ) : (
        secondary
      )}
    </div>
  );
}
