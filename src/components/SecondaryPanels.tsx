"use client";

import { useEffect, useState } from "react";
import type {
  AgentProfile,
  CliProfile,
  CronJob,
  HubTemplate,
  InboxItem,
  Integration,
  NavKey,
  SkillItem,
  Workflow,
} from "@/lib/types";
import { WorkspaceFileTree } from "./workspace/FileTree";

type FsFile = { path: string; name: string; kind: string; size: number };

type DiskSkill = {
  id: string;
  name: string;
  description: string;
  preview?: string;
};

type TrajectoryListItem = {
  id?: string;
  agentId?: string;
  success?: boolean;
  endedAt?: string;
  tools?: string[];
};

type TrajectorySummary = {
  total?: number;
  successRate?: number;
  topTools?: string[];
  failureCount?: number;
};

export function SecondaryPanels(props: {
  nav: NavKey;
  agents: AgentProfile[];
  workflow: Workflow;
  skills: SkillItem[];
  crons: CronJob[];
  integrations: Integration[];
  hub: HubTemplate[];
  inbox: InboxItem[];
  clis: CliProfile[];
  onCreateAgent: (name: string, role: string, cliId: string) => void;
  onUpdateAgent: (id: string, patch: Partial<AgentProfile>) => void;
  onToggleSkill: (id: string) => void;
  onAddSkill: (name: string, description: string, agentId: string) => void;
  onAddCron: (job: Omit<CronJob, "id">) => void;
  onToggleCron: (id: string) => void;
  onDeleteCron: (id: string) => void;
  onSaveIntegration: (id: string, config: Record<string, string>) => void;
  onInstallHub: (id: string) => void;
  onInboxDone: (id: string) => void;
  onSaveCli: (clis: CliProfile[]) => void;
}) {
  const [fsFiles, setFsFiles] = useState<FsFile[]>([]);
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [fileDirty, setFileDirty] = useState(false);
  const [hubTab, setHubTab] = useState<HubTemplate["tab"] | "discover">("discover");
  const [skillTab, setSkillTab] = useState<"agent" | "team">("agent");
  const [autoTab, setAutoTab] = useState<"cron" | "webhook">("cron");
  const [intTab, setIntTab] = useState<"discover" | "manage">("discover");
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentRole, setNewAgentRole] = useState("");
  const [newAgentCli, setNewAgentCli] = useState(
    props.clis[0]?.id || "claude",
  );
  const [editAgentId, setEditAgentId] = useState<string | null>(null);
  const [cronForm, setCronForm] = useState({
    name: "",
    schedule: "@daily",
    agentId: props.agents[0]?.id || "momo",
    prompt: "",
  });
  const [cliEdit, setCliEdit] = useState(props.clis);
  const [diskSkills, setDiskSkills] = useState<DiskSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillEnabled, setSkillEnabled] = useState<Record<string, boolean>>({});
  const [diskCrons, setDiskCrons] = useState<CronJob[] | null>(null);
  const [cronsLoading, setCronsLoading] = useState(false);
  const [trajItems, setTrajItems] = useState<TrajectoryListItem[]>([]);
  const [trajLoading, setTrajLoading] = useState(false);
  const [trajError, setTrajError] = useState<string | null>(null);
  const [trajSummary, setTrajSummary] = useState<TrajectorySummary | null>(
    null,
  );
  const [harvestPath, setHarvestPath] = useState<string | null>(null);
  const [harvestSkillId, setHarvestSkillId] = useState<string | null>(null);
  const [harvestError, setHarvestError] = useState<string | null>(null);
  const [harvestBusy, setHarvestBusy] = useState(false);
  const [diskInbox, setDiskInbox] = useState<InboxItem[] | null>(null);
  const [inboxLoading, setInboxLoading] = useState(false);

  useEffect(() => setCliEdit(props.clis), [props.clis]);

  useEffect(() => {
    if (props.nav !== "workspace") return;
    void fetch("/api/workspace/files")
      .then((r) => r.json())
      .then((d: { files?: FsFile[] }) => setFsFiles(d.files || []))
      .catch(() => setFsFiles([]));
  }, [props.nav]);

  useEffect(() => {
    if (props.nav !== "skills") return;
    setSkillsLoading(true);
    void fetch("/api/agent/skills?preview=1")
      .then((r) => r.json())
      .then((d: { skills?: DiskSkill[]; ok?: boolean }) => {
        const list = Array.isArray(d.skills) ? d.skills : [];
        setDiskSkills(list);
        setSkillEnabled((prev) => {
          const next = { ...prev };
          for (const s of list) {
            if (next[s.id] === undefined) next[s.id] = true;
          }
          return next;
        });
      })
      .catch(() => setDiskSkills([]))
      .finally(() => setSkillsLoading(false));
  }, [props.nav]);

  const refreshDiskCrons = () => {
    setCronsLoading(true);
    return fetch("/api/agent/crons")
      .then((r) => r.json())
      .then((d: { crons?: CronJob[]; ok?: boolean }) => {
        setDiskCrons(Array.isArray(d.crons) ? d.crons : []);
      })
      .catch(() => setDiskCrons([]))
      .finally(() => setCronsLoading(false));
  };

  useEffect(() => {
    if (props.nav !== "automation") return;
    void refreshDiskCrons();
  }, [props.nav]);

  const refreshDiskInbox = () => {
    setInboxLoading(true);
    return fetch("/api/agent/inbox")
      .then((r) => r.json())
      .then((d: { items?: InboxItem[]; inbox?: InboxItem[]; ok?: boolean }) => {
        const list = Array.isArray(d.items)
          ? d.items
          : Array.isArray(d.inbox)
            ? d.inbox
            : [];
        setDiskInbox(list);
      })
      .catch(() => setDiskInbox([]))
      .finally(() => setInboxLoading(false));
  };

  useEffect(() => {
    if (props.nav !== "inbox") return;
    void refreshDiskInbox();
  }, [props.nav]);

  /** Disk SSOT first; seed items fill gaps by id. */
  const displayInbox: InboxItem[] = (() => {
    if (diskInbox === null) return props.inbox;
    const seen = new Set(diskInbox.map((i) => i.id));
    return [...diskInbox, ...props.inbox.filter((i) => !seen.has(i.id))];
  })();

  const markInboxDone = (id: string) => {
    props.onInboxDone(id);
    setDiskInbox((prev) =>
      prev
        ? prev.map((i) => (i.id === id ? { ...i, done: true } : i))
        : prev,
    );
    void fetch("/api/agent/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, done: true }),
    }).then(() => refreshDiskInbox());
  };

  const refreshTrajectories = () => {
    setTrajLoading(true);
    setTrajError(null);
    return fetch("/api/agent/trajectories?limit=10")
      .then((r) => r.json())
      .then(
        (d: {
          ok?: boolean;
          items?: TrajectoryListItem[];
          summary?: TrajectorySummary | null;
          error?: string;
        }) => {
          if (d.ok === false) {
            setTrajError(d.error || "加载失败");
            setTrajItems([]);
            setTrajSummary(null);
            return;
          }
          const list = Array.isArray(d.items) ? d.items : [];
          setTrajItems(list.slice(0, 10));
          const s = d.summary && typeof d.summary === "object" ? d.summary : null;
          setTrajSummary(s);
        },
      )
      .catch(() => {
        setTrajError("网络错误");
        setTrajItems([]);
        setTrajSummary(null);
      })
      .finally(() => setTrajLoading(false));
  };

  const harvestSkill = () => {
    setHarvestBusy(true);
    setHarvestPath(null);
    setHarvestSkillId(null);
    setHarvestError(null);
    return fetch("/api/agent/trajectories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "harvest" }),
    })
      .then((r) => r.json())
      .then(
        (d: {
          ok?: boolean;
          path?: string;
          skillId?: string;
          error?: string;
        }) => {
          if (d.ok === false || !d.path) {
            setHarvestError(d.error || "沉淀失败");
            return;
          }
          setHarvestPath(typeof d.path === "string" ? d.path : String(d.path));
          setHarvestSkillId(
            typeof d.skillId === "string" && d.skillId
              ? d.skillId
              : "lessons-from-runs",
          );
        },
      )
      .catch(() => setHarvestError("网络错误"))
      .finally(() => setHarvestBusy(false));
  };

  const openFile = async (path: string) => {
    const r = await fetch(`/api/workspace/files?path=${encodeURIComponent(path)}`);
    const d = (await r.json()) as { content?: string; error?: string };
    if (d.error) {
      setFileContent(`// error: ${d.error}`);
    } else {
      setFileContent(d.content || "");
    }
    setOpenPath(path);
    setFileDirty(false);
  };

  const saveFile = async () => {
    if (!openPath) return;
    await fetch("/api/workspace/files", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: openPath, content: fileContent }),
    });
    setFileDirty(false);
  };

  if (props.nav === "chat") return null;

  const titleMap: Record<string, string> = {
    workspace: "工作空间",
    members: "AI 同事",
    workflows: "工作流",
    skills: "技能",
    automation: "自动化",
    integrations: "集成",
    hub: "资源广场",
    inbox: "收件箱",
    settings: "账号 / 本地 CLI",
  };

  return (
    <div className="yxt-scroll flex min-w-0 flex-1 flex-col overflow-auto bg-white p-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {titleMap[props.nav] || props.nav}
      </h1>

      {props.nav === "members" ? (
        <div className="max-w-4xl space-y-6">
          <div className="flex gap-2 text-[13px]">
            <span className="rounded-full bg-[var(--yxt-selected)] px-3 py-1">
              全部
            </span>
            <span className="rounded-full px-3 py-1 text-[var(--yxt-muted)]">
              管理 ({props.agents.length})
            </span>
            <span className="rounded-full px-3 py-1 text-[var(--yxt-muted)]">
              共享 (0)
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {props.agents.map((a) => {
              const editing = editAgentId === a.id;
              return (
                <div
                  key={a.id}
                  className="rounded-2xl border border-[var(--yxt-border-soft)] p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                      style={{ background: a.color }}
                    >
                      {a.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      {editing ? (
                        <input
                          className="mb-1 w-full rounded border border-[var(--yxt-border-soft)] px-2 py-1 text-[13px] font-medium"
                          defaultValue={a.name}
                          onBlur={(e) =>
                            props.onUpdateAgent(a.id, { name: e.target.value })
                          }
                        />
                      ) : (
                        <div className="font-medium">{a.name}</div>
                      )}
                      <div className="flex items-center gap-2 text-xs text-[var(--yxt-muted)]">
                        <span>CLI</span>
                        <select
                          className="rounded border border-[var(--yxt-border-soft)] px-1 py-0.5"
                          value={a.cliId}
                          onChange={(e) =>
                            props.onUpdateAgent(a.id, { cliId: e.target.value })
                          }
                        >
                          {props.clis.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-[12px] text-indigo-600"
                      onClick={() =>
                        setEditAgentId(editing ? null : a.id)
                      }
                    >
                      {editing ? "完成" : "编辑"}
                    </button>
                  </div>
                  {editing ? (
                    <textarea
                      className="w-full rounded-lg border border-[var(--yxt-border-soft)] px-2 py-1.5 text-[13px]"
                      rows={3}
                      defaultValue={a.role}
                      onBlur={(e) =>
                        props.onUpdateAgent(a.id, { role: e.target.value })
                      }
                    />
                  ) : (
                    <p className="text-[13px] leading-relaxed text-[var(--yxt-muted)]">
                      {a.role}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="rounded-2xl border border-dashed border-[var(--yxt-border)] p-4">
            <div className="mb-2 font-medium">创建 AI 同事</div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 md:flex-row">
                <input
                  className="flex-1 rounded-lg border border-[var(--yxt-border-soft)] px-3 py-2 text-[13px]"
                  placeholder="名称"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                />
                <select
                  className="rounded-lg border border-[var(--yxt-border-soft)] px-3 py-2 text-[13px]"
                  value={newAgentCli}
                  onChange={(e) => setNewAgentCli(e.target.value)}
                >
                  {props.clis.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                className="w-full rounded-lg border border-[var(--yxt-border-soft)] px-3 py-2 text-[13px]"
                placeholder="职责描述"
                value={newAgentRole}
                onChange={(e) => setNewAgentRole(e.target.value)}
              />
              <button
                type="button"
                className="self-start rounded-lg bg-[var(--yxt-ink)] px-4 py-2 text-[13px] text-white"
                onClick={() => {
                  if (!newAgentName.trim()) return;
                  props.onCreateAgent(
                    newAgentName.trim(),
                    newAgentRole.trim() || "自定义角色",
                    newAgentCli,
                  );
                  setNewAgentName("");
                  setNewAgentRole("");
                }}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {props.nav === "workspace" ? (
        <WorkspaceFileTree
          files={fsFiles}
          openPath={openPath}
          fileContent={fileContent}
          fileDirty={fileDirty}
          onOpenFile={(path) => void openFile(path)}
          onChangeContent={(v) => {
            setFileContent(v);
            setFileDirty(true);
          }}
          onSave={() => void saveFile()}
        />
      ) : null}

      {props.nav === "workflows" ? (
        <div className="max-w-3xl space-y-4">
          <p className="text-[13px] text-[var(--yxt-muted)]">
            跨空间组合视图 · 始终展示当前状态
          </p>
          <div className="rounded-2xl border border-[var(--yxt-border-soft)] p-5">
            <div className="mb-1 font-medium">{props.workflow.title}.workflow</div>
            <div className="mb-4 text-xs text-[var(--yxt-muted)]">{props.workflow.path}</div>
            <div className="mb-3 text-[13px]">
              {props.workflow.tasks.length} 个任务 ·{" "}
              {
                props.workflow.tasks.filter((t) =>
                  ["ai-review", "draft", "bdd", "dev"].includes(t.stageId),
                ).length
              }{" "}
              个处理中
            </div>
            <div className="flex flex-wrap gap-2">
              {props.workflow.stages.map((s) => {
                const n = props.workflow.tasks.filter((t) => t.stageId === s.id).length;
                return (
                  <div
                    key={s.id}
                    className="rounded-lg bg-[#f5f6f7] px-3 py-2 text-xs"
                  >
                    {s.title} · {n}
                    {s.humanGate ? " · 人工" : ""}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {props.nav === "skills" ? (
        <div className="max-w-3xl space-y-4">
          <div className="flex gap-3 text-[13px]">
            <button
              type="button"
              className={skillTab === "agent" ? "font-medium" : "text-[var(--yxt-muted)]"}
              onClick={() => setSkillTab("agent")}
            >
              Agent 技能
            </button>
            <button
              type="button"
              className={skillTab === "team" ? "font-medium" : "text-[var(--yxt-muted)]"}
              onClick={() => setSkillTab("team")}
            >
              团队技能
            </button>
          </div>
          <div className="space-y-2">
            {skillsLoading ? (
              <div className="text-[13px] text-[var(--yxt-muted)]">加载磁盘技能…</div>
            ) : null}
            {!skillsLoading && diskSkills.length === 0 ? (
              <div className="text-[13px] text-[var(--yxt-muted)]">
                暂无技能（workspace/.agent/skills）
              </div>
            ) : null}
            {diskSkills.map((s) => {
              const enabled = skillEnabled[s.id] !== false;
              return (
                <div
                  key={s.id}
                  className="flex items-start justify-between rounded-xl border border-[var(--yxt-border-soft)] px-4 py-3"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="font-medium text-[14px]">{s.name}</div>
                    <div className="mt-1 text-[13px] text-[var(--yxt-muted)]">
                      {s.description}
                    </div>
                    {s.preview ? (
                      <pre className="mt-2 max-h-20 overflow-hidden whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--yxt-muted)] opacity-80">
                        {s.preview}
                      </pre>
                    ) : null}
                    <div className="mt-1 text-[11px] text-[var(--yxt-muted)]">
                      磁盘 · {s.id}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSkillEnabled((prev) => ({
                        ...prev,
                        [s.id]: !enabled,
                      }))
                    }
                    className={`shrink-0 rounded-full px-3 py-1 text-[12px] ${
                      enabled
                        ? "bg-[var(--yxt-mint-soft)] text-emerald-800"
                        : "bg-[#f3f4f6] text-[var(--yxt-muted)]"
                    }`}
                  >
                    {enabled ? "已启用" : "已关闭"}
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="rounded-lg border border-[var(--yxt-border-soft)] px-3 py-2 text-[13px]"
            onClick={() =>
              props.onAddSkill(
                "custom-skill",
                "用户新增技能",
                props.agents[0]?.id || "momo",
              )
            }
          >
            + 添加技能
          </button>
        </div>
      ) : null}

      {props.nav === "automation" ? (
        <div className="max-w-3xl space-y-4">
          <div className="flex gap-3 text-[13px]">
            <button
              type="button"
              className={autoTab === "cron" ? "font-medium" : "text-[var(--yxt-muted)]"}
              onClick={() => setAutoTab("cron")}
            >
              定时任务
            </button>
            <button
              type="button"
              className={autoTab === "webhook" ? "font-medium" : "text-[var(--yxt-muted)]"}
              onClick={() => setAutoTab("webhook")}
            >
              Webhooks
            </button>
          </div>
          {autoTab === "cron" ? (
            <>
              {cronsLoading && diskCrons === null ? (
                <div className="text-[14px] text-[var(--yxt-muted)]">加载磁盘定时任务…</div>
              ) : (diskCrons ?? props.crons).length === 0 ? (
                <div className="text-[14px] text-[var(--yxt-muted)]">
                  暂无定时任务（磁盘 SSOT：workspace/.agent/crons.json）
                </div>
              ) : (
                <ul className="space-y-2">
                  {(diskCrons ?? props.crons).map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between rounded-xl border border-[var(--yxt-border-soft)] px-4 py-3 text-[13px]"
                    >
                      <div>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-[var(--yxt-muted)]">
                          {c.schedule} ·{" "}
                          {props.agents.find((a) => a.id === c.agentId)?.name ||
                            c.agentId}
                          {c.lastRun
                            ? ` · 上次 ${new Date(c.lastRun).toLocaleString()}`
                            : ""}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void fetch("/api/agent/crons", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                id: c.id,
                                enabled: !c.enabled,
                              }),
                            })
                              .then(() => refreshDiskCrons())
                              .then(() => props.onToggleCron(c.id));
                          }}
                          className="rounded-lg bg-[#f3f4f6] px-2 py-1"
                        >
                          {c.enabled ? "启用中" : "已停用"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void fetch("/api/agent/crons", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "remove",
                                id: c.id,
                              }),
                            })
                              .then(() => refreshDiskCrons())
                              .then(() => props.onDeleteCron(c.id));
                          }}
                          className="text-rose-600"
                        >
                          删除
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="rounded-2xl border border-[var(--yxt-border-soft)] p-4 space-y-2">
                <div className="font-medium text-[13px]">添加定时任务</div>
                <input
                  className="w-full rounded-lg border border-[var(--yxt-border-soft)] px-3 py-2 text-[13px]"
                  placeholder="名称"
                  value={cronForm.name}
                  onChange={(e) => setCronForm({ ...cronForm, name: e.target.value })}
                />
                <input
                  className="w-full rounded-lg border border-[var(--yxt-border-soft)] px-3 py-2 text-[13px]"
                  placeholder="@hourly / @daily / every_minutes:N"
                  value={cronForm.schedule}
                  onChange={(e) => setCronForm({ ...cronForm, schedule: e.target.value })}
                />
                <select
                  className="w-full rounded-lg border border-[var(--yxt-border-soft)] px-3 py-2 text-[13px]"
                  value={cronForm.agentId}
                  onChange={(e) =>
                    setCronForm({ ...cronForm, agentId: e.target.value })
                  }
                >
                  {props.agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <textarea
                  className="w-full rounded-lg border border-[var(--yxt-border-soft)] px-3 py-2 text-[13px]"
                  placeholder="发给本地 CLI 的 prompt"
                  rows={2}
                  value={cronForm.prompt}
                  onChange={(e) => setCronForm({ ...cronForm, prompt: e.target.value })}
                />
                <button
                  type="button"
                  className="rounded-lg bg-[var(--yxt-ink)] px-3 py-2 text-[13px] text-white"
                  onClick={() => {
                    if (!cronForm.name.trim()) return;
                    const job = {
                      name: cronForm.name,
                      schedule: cronForm.schedule || "@daily",
                      agentId: cronForm.agentId,
                      prompt: cronForm.prompt,
                      enabled: true,
                    };
                    void fetch("/api/agent/crons", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(job),
                    })
                      .then(() => refreshDiskCrons())
                      .then(() => props.onAddCron(job));
                    setCronForm({
                      name: "",
                      schedule: "@daily",
                      agentId: props.agents[0]?.id || "momo",
                      prompt: "",
                    });
                  }}
                >
                  添加
                </button>
              </div>
            </>
          ) : (
            <div className="text-[14px] text-[var(--yxt-muted)]">
              Webhook 入口：POST /api/agent/run（本地）。可把外部事件接到本地 CLI。
            </div>
          )}
        </div>
      ) : null}

      {props.nav === "integrations" ? (
        <div className="max-w-3xl space-y-4">
          <div className="flex gap-3 text-[13px]">
            <button
              type="button"
              className={intTab === "discover" ? "font-medium" : "text-[var(--yxt-muted)]"}
              onClick={() => setIntTab("discover")}
            >
              发现
            </button>
            <button
              type="button"
              className={intTab === "manage" ? "font-medium" : "text-[var(--yxt-muted)]"}
              onClick={() => setIntTab("manage")}
            >
              管理
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {props.integrations
              .filter((i) => (intTab === "manage" ? i.configured : true))
              .map((i) => (
                <div
                  key={i.id}
                  className="rounded-xl border border-[var(--yxt-border-soft)] p-4 text-[13px]"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <div className="font-medium">{i.name}</div>
                    <span className="text-[11px] text-[var(--yxt-muted)]">{i.category}</span>
                  </div>
                  <p className="mb-3 text-[var(--yxt-muted)]">{i.description}</p>
                  {Object.keys(i.config || {}).map((k) => (
                    <input
                      key={k}
                      className="mb-2 w-full rounded-lg border border-[var(--yxt-border-soft)] px-2 py-1.5 text-[12px]"
                      placeholder={k}
                      defaultValue={i.config?.[k] || ""}
                      onBlur={(e) =>
                        props.onSaveIntegration(i.id, {
                          ...(i.config || {}),
                          [k]: e.target.value,
                        })
                      }
                    />
                  ))}
                  <div className="text-[11px] text-[var(--yxt-muted)]">
                    {i.configured ? "已配置（本地保存）" : "填写后自动保存"}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : null}

      {props.nav === "hub" ? (
        <div className="max-w-4xl space-y-4">
          <p className="text-[var(--yxt-muted)]">
            工作流、AI 同事、小程序、页面和技能——精选内容，即刻可用。
          </p>
          <div className="flex flex-wrap gap-2 text-[13px]">
            {(
              [
                ["discover", "发现"],
                ["workflow", "工作流"],
                ["miniapp", "小程序"],
                ["teammate", "AI 同事"],
                ["html", "HTML 模板"],
                ["skill", "技能"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setHubTab(k)}
                className={`rounded-full border px-3 py-1 ${
                  hubTab === k
                    ? "border-[var(--yxt-ink)] bg-[var(--yxt-selected)]"
                    : "border-[var(--yxt-border-soft)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {props.hub
              .filter((h) => hubTab === "discover" || h.tab === hubTab)
              .map((h) => (
                <div
                  key={h.id}
                  className="rounded-2xl border border-[var(--yxt-border-soft)] p-4"
                >
                  <div className="mb-1 text-[11px] text-[var(--yxt-muted)]">{h.category}</div>
                  <div className="font-medium">{h.title}</div>
                  <p className="mt-2 text-[13px] text-[var(--yxt-muted)]">{h.description}</p>
                  <button
                    type="button"
                    disabled={h.installed}
                    onClick={() => props.onInstallHub(h.id)}
                    className="mt-3 rounded-lg bg-[var(--yxt-ink)] px-3 py-1.5 text-[12px] text-white disabled:bg-[var(--yxt-mint)]"
                  >
                    {h.installed ? "已安装" : "使用 / 安装"}
                  </button>
                </div>
              ))}
          </div>
        </div>
      ) : null}

      {props.nav === "inbox" ? (
        <div className="max-w-2xl space-y-3">
          {inboxLoading ? (
            <div className="text-[13px] text-[var(--yxt-muted)]">加载收件箱…</div>
          ) : null}
          {displayInbox.filter((i) => !i.done).length === 0 && !inboxLoading ? (
            <div className="text-[14px] text-[var(--yxt-muted)]">暂无待办</div>
          ) : null}
          {displayInbox.map((i) => (
            <div
              key={i.id}
              className={`rounded-xl border border-[var(--yxt-border-soft)] p-4 ${
                i.done ? "opacity-50" : ""
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <div className="font-medium text-[14px]">{i.title}</div>
                <span className="text-[11px] text-[var(--yxt-muted)]">{i.createdAt}</span>
              </div>
              <p className="text-[13px] text-[var(--yxt-muted)]">{i.body}</p>
              {!i.done ? (
                <button
                  type="button"
                  className="mt-2 text-[13px] text-indigo-600"
                  onClick={() => markInboxDone(i.id)}
                >
                  标为已处理
                </button>
              ) : (
                <div className="mt-2 text-[12px] text-[var(--yxt-muted)]">已处理</div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {props.nav === "settings" ? (
        <div className="max-w-xl space-y-4">
          <p className="text-[13px] text-[var(--yxt-muted)]">
            相对 Moxt 的唯一产品差异：不走云端 Credits，接入本机 CLI Agent。可改 command /
            args，刷新后保留。
          </p>
          {cliEdit.map((c, idx) => (
            <div
              key={c.id}
              className="space-y-2 rounded-xl border border-[var(--yxt-border-soft)] p-4"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{c.label}</div>
                <span
                  className={`text-xs ${c.available ? "text-emerald-600" : "text-amber-600"}`}
                >
                  {c.available ? "已检测到" : "未安装 / 回环"}
                </span>
              </div>
              <input
                className="w-full rounded-lg border border-[var(--yxt-border-soft)] px-2 py-1.5 font-mono text-[12px]"
                value={c.command}
                onChange={(e) => {
                  const next = [...cliEdit];
                  next[idx] = { ...c, command: e.target.value };
                  setCliEdit(next);
                }}
              />
              <input
                className="w-full rounded-lg border border-[var(--yxt-border-soft)] px-2 py-1.5 font-mono text-[12px]"
                value={c.args.join(" ")}
                onChange={(e) => {
                  const next = [...cliEdit];
                  next[idx] = {
                    ...c,
                    args: e.target.value.split(" ").filter(Boolean),
                  };
                  setCliEdit(next);
                }}
              />
              <div className="text-[13px] text-[var(--yxt-muted)]">{c.description}</div>
            </div>
          ))}
          <button
            type="button"
            className="rounded-lg bg-[var(--yxt-ink)] px-4 py-2 text-[13px] text-white"
            onClick={() => props.onSaveCli(cliEdit)}
          >
            保存 CLI 配置
          </button>

          <div className="mt-2 space-y-3 rounded-xl border border-[var(--yxt-border-soft)] p-4">
            <div className="font-medium text-[14px]">运行轨迹（Ch8）</div>
            <p className="text-[12px] text-[var(--yxt-muted)]">
              查看最近 Agent 运行记录，或将失败经验沉淀为 skill。
            </p>
            {trajSummary &&
            typeof trajSummary.successRate === "number" &&
            Number.isFinite(trajSummary.successRate) ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-[#f5f6f7] px-3 py-2 text-[12px]">
                <span>
                  成功率{" "}
                  <span className="font-medium text-[var(--yxt-ink)]">
                    {(trajSummary.successRate * 100).toFixed(1)}%
                  </span>
                </span>
                {typeof trajSummary.total === "number" ? (
                  <span className="text-[var(--yxt-muted)]">
                    共 {trajSummary.total} 条
                  </span>
                ) : null}
                {typeof trajSummary.failureCount === "number" ? (
                  <span className="text-[var(--yxt-muted)]">
                    失败 {trajSummary.failureCount}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-[var(--yxt-border-soft)] px-3 py-1.5 text-[13px]"
                disabled={trajLoading}
                onClick={() => void refreshTrajectories()}
              >
                {trajLoading ? "加载中…" : "刷新轨迹"}
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--yxt-ink)] px-3 py-1.5 text-[13px] text-white disabled:opacity-60"
                disabled={harvestBusy}
                onClick={() => void harvestSkill()}
              >
                {harvestBusy ? "沉淀中…" : "沉淀经验 skill"}
              </button>
            </div>
            {trajError ? (
              <div className="text-[12px] text-rose-600">{trajError}</div>
            ) : null}
            {harvestError ? (
              <div className="text-[12px] text-rose-600">{harvestError}</div>
            ) : null}
            {harvestPath ? (
              <div className="space-y-1.5 rounded-lg border border-[var(--yxt-border-soft)] bg-[#f5f6f7] px-3 py-2.5">
                <div className="text-[11px] font-medium text-[var(--yxt-muted)]">
                  沉淀路径
                </div>
                <div
                  className="break-all font-mono text-[12px] text-[var(--yxt-ink)]"
                  title={harvestPath}
                >
                  {harvestPath}
                </div>
                {harvestSkillId ? (
                  <div className="pt-0.5 text-[12px]">
                    <span className="text-[var(--yxt-muted)]">lessons skill · </span>
                    <span
                      className="cursor-default font-mono text-indigo-600 underline decoration-indigo-300 underline-offset-2"
                      title={`.agent/skills/${harvestSkillId}.md`}
                    >
                      {harvestSkillId}
                    </span>
                    <span className="ml-1 text-[11px] text-[var(--yxt-muted)]">
                      (.agent/skills/{harvestSkillId}.md)
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
            {trajItems.length === 0 && !trajLoading && !trajError ? (
              <div className="text-[13px] text-[var(--yxt-muted)]">
                暂无轨迹，点「刷新轨迹」加载
              </div>
            ) : null}
            {trajItems.length > 0 ? (
              <ul className="space-y-2">
                {trajItems.map((t, i) => {
                  const row =
                    t && typeof t === "object"
                      ? t
                      : ({} as TrajectoryListItem);
                  const tools = Array.isArray(row.tools) ? row.tools : [];
                  const ok = row.success === true;
                  const fail = row.success === false;
                  return (
                    <li
                      key={
                        typeof row.id === "string" && row.id
                          ? row.id
                          : `traj-${i}`
                      }
                      className="flex items-center justify-between rounded-xl border border-[var(--yxt-border-soft)] px-3 py-2 text-[12px]"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="truncate font-mono text-[11px]">
                          {typeof row.id === "string" && row.id ? row.id : "—"}
                        </div>
                        <div className="mt-0.5 text-[var(--yxt-muted)]">
                          {(typeof row.agentId === "string" && row.agentId) ||
                            "—"}{" "}
                          · tools {tools.length}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                          ok
                            ? "bg-[var(--yxt-mint-soft)] text-emerald-800"
                            : fail
                              ? "bg-rose-50 text-rose-700"
                              : "bg-[#f3f4f6] text-[var(--yxt-muted)]"
                        }`}
                      >
                        {ok ? "成功" : fail ? "失败" : "未知"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
