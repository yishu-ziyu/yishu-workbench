# Gap Analysis — 奕枢的工作台 (yishu-workbench)

Date: 2026-08-06  
Scope: factual inventory of what ships today vs a full **Agent = LLM + Context + Tools** runtime.  
No implementation in this document.

---

## 1. What exists (territory facts)

### Product identity

- Package: `yishu-workbench` (`package.json`) — “local-CLI agent workspace”.
- Positioning (`README.md`): Moxt-like product surfaces (对话 / 工作空间 / AI 同事 / 工作流 / 技能 / 自动化 / 集成 / 资源广场), but compute path is **local CLI** (`claude` / `codex` / custom / echo), not cloud Credits.
- Entry: `src/app/page.tsx` → `WorkspaceApp`.
- Stack: Next.js 16 + React 19, Tailwind 4, `@dnd-kit/*`, `@xyflow/react`, `streamdown`, `react-resizable-panels`. No OpenAI/Anthropic SDK, no MCP client library, no DB, no job queue.

### UI shell (real React surfaces)

| Surface | Path | Behavior today |
|--------|------|----------------|
| Icon rail nav | `src/components/IconRail.tsx` | chat, workspace, members, workflows, skills, automation, integrations, hub, inbox, settings |
| Chat layout | `WorkspaceApp.tsx` + `ChatSidebar` + `ChatPanel`/`Thread` + `WorkflowPanel` | resizable 3-pane when `nav === "chat"` |
| Secondary panels | `src/components/SecondaryPanels.tsx` | all non-chat nav |
| Types / seed | `src/lib/types.ts`, `src/lib/seed.ts` | domain model + demo data |
| Persistence | `STORAGE_KEY = "yxt-app-state-v2"` in `seed.ts`; load/save in `WorkspaceApp.tsx` | browser `localStorage` only |

### Real server / filesystem paths

| Endpoint | File | What it actually does |
|----------|------|------------------------|
| `POST /api/agent/run` | `src/app/api/agent/run/route.ts` | NDJSON stream (`application/x-ndjson`) over `runLocalCli` |
| `GET /api/cli/list` | `src/app/api/cli/list/route.ts` | `which` availability for seed CLI profiles |
| `GET/PUT/POST /api/workspace/files` | `src/app/api/workspace/files/route.ts` | list / read / write under `process.cwd()/workspace` with path-escape guard |

| Module | File | Reality |
|--------|------|---------|
| CLI spawn | `src/lib/cli-runner.ts` | `spawn` + stdout→`token`, synthetic `step` events, missing binary → bash `printf` echo loopback |
| File tree pure | `src/lib/file-tree.ts` | flat paths → nested tree (no WebContainer) |
| Stream MD | `src/lib/stream-markdown.ts` + `src/lib/markdown.tsx` | incomplete fence stabilize + `Streamdown` |
| Workspace disk | `workspace/General/PRD - Spec 评审/*`, `workspace/Hub/verify.md` | real files on disk |

### Chat run path (wired end-to-end)

```
Composer.onSend
  → WorkspaceApp.onSend
  → POST /api/agent/run { prompt, cliId, cli?, cwd? }
  → runLocalCli (spawn)
  → NDJSON step|token|done|error
  → liveSteps / liveText → final ChatMessage in localStorage state
```

- Abort: `AbortController` + Composer stop button (`data-yxt-role="composer-stop"`).
- CLI selector: Composer `data-yxt-role="cli-selector"`; profiles from seed + `/api/cli/list` merge; editable in settings and passed as `cli` override.
- Selecting an agent copies `agent.cliId` into `selectedCliId` (`WorkspaceApp` `onSelectAgent`).

### Workflow board (client-only, interactive)

- `src/components/WorkflowPanel.tsx`: DnD kanban (`@dnd-kit`), list/flow/activity tabs, task CRUD handlers from `WorkspaceApp` (`onAddTask` / `onMoveTask` / `onUpdateTask` / `onDeleteTask`).
- Stages/tasks come from `seed.WORKFLOW` (9 stages, 2 sample tasks), stored in `AppState.workflow` → localStorage.
- Disk files `workspace/.../PRD - Spec 评审.workflow` and `workflow.md` are **not** read/written by the board.

### Placeholders on disk (empty dirs, zero modules)

```
src/lib/agent/eval/
src/lib/agent/memory/
src/lib/agent/multi/
src/lib/agent/providers/
src/lib/agent/skills/
src/lib/agent/tools/
```

No imports from these directories appear in the app.

### Verification already in repo

- `scripts/verify-deepen.mjs` (`pnpm test:deepen`): pure checks for stream-markdown + file-tree; static asserts that Composer/Thread/Sidebar/WorkspaceApp still wire send/stop/CLI/thread-list; markdown uses streamdown; no webcontainer dep; workspace UI hits `/api/workspace/files`.

---

## 2. What is UI-only mock vs real

Legend: **Real** = observable server/fs/process effect. **Local UI** = React + localStorage only. **Seed fiction** = demo content that never ran through today’s runtime.

| Capability | Verdict | Evidence |
|------------|---------|----------|
| Spawn local CLI and stream stdout | **Real** | `cli-runner.ts`, `/api/agent/run` |
| CLI missing → echo loopback text | **Real** (dev fallback) | `cli-runner.ts` bash `printf` branches |
| Detect CLI on PATH | **Real** | `/api/cli/list` + `whichSync` |
| Workspace list / open / save files | **Real** | `/api/workspace/files` + `SecondaryPanels` workspace branch + `FileTree.tsx` |
| Hub install → write `Hub/<title>.md` | **Real (partial)** | `WorkspaceApp.onInstallHub` POST for workflow/miniapp/html tabs only |
| Hub install → add agent/skill rows | **Local UI** | same handler mutates `agents` / `skills` only |
| Chat history multi-turn to model | **Not real** | `onSend` body is single `prompt: text` only; prior messages never sent |
| Agent `role` / name as system context | **Not real** | `role` displayed/edited; never included in `/api/agent/run` body |
| Seed conversation tool steps (skill/read/mcp) | **Seed fiction** | `SEED_CONVERSATION` in `seed.ts`; live runs only emit cli/think/log from runner |
| Composer context chip `PRD - Spec 评审.workflow` | **Hardcoded UI** | string in `WorkspaceApp` `contextLabel`; not file attach / not in prompt |
| Skills list + enable toggle + add | **Local UI** | `onToggleSkill` / `onAddSkill`; unused by runner |
| Cron CRUD UI | **Local UI** | `crons` in state; **no scheduler process** |
| Automation “Webhooks” tab | **Copy only** | text points at `POST /api/agent/run`; no auth, no event mapping, no registration |
| Integrations form fields | **Local UI** | `onSaveIntegration` → localStorage; no MCP/OAuth/API client uses `config` |
| Inbox items + “标为已处理” | **Local UI + seed** | `INBOX` seed; not generated by workflow humanGate transitions |
| Workflow stage move / task edit | **Local UI** | not persisted to `*.workflow` or any server |
| Workflow humanGate badge | **Display only** | no gate engine, no inbox enqueue on enter |
| Activity feed | **Local UI** | `pushActivity` strings; not agent telemetry |
| Multi-agent orchestration | **Absent** | empty `src/lib/agent/multi/` |
| Memory / RAG | **Absent** | empty `src/lib/agent/memory/` |
| Tool registry / MCP loop in app | **Absent** | empty `tools/`; integrations MCP is form only |
| Eval harness | **Absent** | empty `src/lib/agent/eval/` |
| Mic / Plus in Composer | **Dead controls** | buttons with no handlers |
| Shared agents tab count | **Static UI** | “共享 (0)” not backed by data |

### Live run events vs seed steps

| Event source | Kinds | Wired to UI |
|--------------|-------|-------------|
| `runLocalCli` | `cli`, `think`, `log` (+ optional stderr log), `token`, `done`, `error` | Yes (`liveSteps` / message `steps`) |
| Seed assistant message | `think`, `skill`, `read`, `mcp` | Display only for historical seed message |

---

## 3. Gaps vs Agent = LLM + Context + Tools

Working definition used here:

```
Agent  =  LLM (decision/generation)
        + Context (who / history / files / domain state)
        + Tools (side effects the model can invoke and observe)
```

### LLM (compute)

| Need | Status | Gap |
|------|--------|-----|
| Callable model process | **Partial** | Single-shot CLI print/exec (`claude -p`, `codex exec`, generic args+prompt). No session resume, no structured tool-result channel back into this app. |
| Provider abstraction | **Missing** | Empty `providers/`; only spawn string profiles. |
| Streaming UX | **Present** | NDJSON tokens + Streamdown. |
| Stop generation | **Present** | Abort fetch; process may keep running server-side (no kill PID API). |

### Context

| Need | Status | Gap |
|------|--------|-----|
| Conversation history | **UI only** | Stored in `Conversation.messages`; **not** packed into next `prompt`. |
| Agent persona (`AgentProfile.role`) | **UI only** | Not system/developer preamble. |
| Active workflow / task | **UI only** | Board state not injected; disk `workflow.md` not auto-attached. |
| Workspace files | **Human editor real; agent blind** | Files API exists for UI; agent run does not read files unless the **external** CLI itself is given a cwd and does so on its own. Default `cwd` is optional `NEXT_PUBLIC_WORKSPACE_CWD` or process cwd, not guaranteed `workspace/`. |
| Skills as prompt/modules | **Catalog only** | `SkillItem.enabled` never filters or loads skill bodies. |
| Memory across sessions | **Missing** | Only localStorage app state; empty `memory/`. |
| Inbox / approvals as context | **Missing** | No link from gate state → agent prompt. |

### Tools

| Need | Status | Gap |
|------|--------|-----|
| In-app tool loop (plan → call → observe → continue) | **Missing** | Runner is fire-and-forget spawn; stdout is the answer. |
| Workspace tools (read/write/list) | **API exists, agent unused** | Same routes humans use; not exposed as agent tools with allowlists. |
| Workflow tools (list/move/create task) | **Missing** | Seed labels “Local Workflow: get-workflow” are fiction. |
| MCP | **Form only** | Integration id `mcp` stores command/args in localStorage. |
| Cron as scheduled tool user | **Missing** | Jobs never fire `runLocalCli`. |
| Multi-agent handoff tools | **Missing** | Empty `multi/`. |
| Structured step kinds `skill` / `read` / `mcp` at runtime | **Missing** | Types allow them; runner does not emit them for real work. |

### Architectural picture (current vs target)

```
CURRENT
  Browser (localStorage AppState)
       |  prompt only
       v
  /api/agent/run  -->  spawn CLI  -->  stdout stream
  /api/workspace/files  <-->  workspace/   (UI only)
  (skills/cron/workflow/inbox/integrations stay in browser)

TARGET (without rewriting Moxt-like UI)
  Browser (same panels, same events)
       |  run request: agentId, convId, message, attachments, policy
       v
  Agent runtime
       + build context (history, role, skills, files, workflow slice)
       + LLM/CLI provider
       + tool bus (workspace, workflow, inbox, mcp, cron triggers)
       + optional memory / multi-agent
       v
  events (steps/tokens) still NDJSON-compatible with current UI
```

---

## 4. Business domain surfaces and what’s wired

### PRD / Spec workflow

| Piece | Location | Wired? |
|-------|----------|--------|
| Domain copy / stages | `seed.WORKFLOW`, `workspace/.../workflow.md`, `*.workflow` | Stages duplicated: seed (rich ids + humanGate) vs disk (title list only). **No sync.** |
| Kanban board | `WorkflowPanel.tsx` + `WorkspaceApp` handlers | **UI CRUD real in localStorage.** |
| Secondary “工作流” summary | `SecondaryPanels` `nav === "workflows"` | Read-only view of same state. |
| Chat “初始化工作流” seed | `SEED_CONVERSATION` | Fiction relative to current runner. |
| Human gates → inbox | types have `humanGate`, inbox has `approval` | **Not coupled.** Moving task to PM 评审 does not create inbox items. |
| Assignee → agent run | task `assigneeId` | Display/edit only; no auto-run on stage enter. |

### Agents (AI 同事)

| Piece | Wired? |
|-------|--------|
| List / create / edit name·role·cliId | **Local UI** (`members` panel + sidebar chips) |
| cliId → selected CLI for next chat | **Yes** on agent select |
| role → model | **No** |
| Per-agent conversation isolation | Partial: conv has `agentId`; send uses `state.activeAgentId` for assistant tag, CLI from `selectedCliId` |
| Hub teammate install | Adds `AgentProfile` row only |

### Skills

| Piece | Wired? |
|-------|--------|
| Catalog + agent/team tabs | **Local UI** |
| Enable/disable | **Local UI** |
| Skill bodies / SKILL.md / injection | **No** (empty `src/lib/agent/skills/`) |
| Runtime step `kind: "skill"` | Seed display only |

### Inbox

| Piece | Wired? |
|-------|--------|
| Seed approvals/mentions | **Local** |
| Mark done | **Local** |
| Produced by gates / agent / cron | **No** |
| Rail badge count | **Yes** (`inbox.filter !done`) |

### Cron / automation

| Piece | Wired? |
|-------|--------|
| Cron form (name, schedule, agentId, prompt) | **Local list** |
| Enable / delete | **Local** |
| Scheduler tick / lastRun update | **No** (`lastRun` on type unused) |
| Webhook registration | **No** (docs-as-UI) |

### Integrations / Hub / Settings

| Piece | Wired? |
|-------|--------|
| Integration configs | **LocalStorage** |
| Local CLI integration `configured: true` | Reflects product path; actual path is settings + Composer |
| Settings save CLI command/args | **Yes** → state → passed as `cli` override on run |
| Hub templates | **Catalog local**; install side-effects as §2 |

### Workspace files vs chat context

| Piece | Wired? |
|-------|--------|
| Tree + editor | **Real API** |
| `Conversation.contextFileId` | Field exists (`"wf-prd"` in seed/new chat); **never resolved to a file or prompt** |
| Agent cwd = workspace root | **Not defaulted** in code path (only optional env) |

---

## 5. Recommended implementation order (phases)

Constraint: **keep existing UI shells**; fill runtime behind current panels and NDJSON stream shape so `WorkspaceApp` / Composer / step chips keep working.

### Phase 0 — Contract freeze (no UX rewrite)

- Treat `POST /api/agent/run` NDJSON events (`step` / `token` / `done` / `error`) as the stable UI bus.
- Extend request body (additive): `agentId`, `messages[]` or `conversationId`, `skillIds[]`, `cwd` default `workspace/`, optional `taskId` / `workflowId`.
- Keep `src/lib/agent/*` as the only new implementation home (dirs already reserved).

**Done when:** UI still passes `pnpm test:deepen`; new fields ignored safely if absent.

### Phase 1 — Context packing (LLM + Context, zero new tools)

- Build prompt/system block from: `AgentProfile.role`, last N messages, enabled skill **names+descriptions** (even if bodies stub), optional attached paths.
- Default `cwd` to absolute `workspace/`.
- Resolve `contextFileId` / context chip to real file contents via workspace FS (same safeJoin rules as files route).
- Stop claiming skill/mcp steps unless they run.

**Done when:** multi-turn chat and agent role visibly change CLI behavior; seed fiction steps no longer appear on new runs.

### Phase 2 — Workspace tools (first real Tools)

- Implement `src/lib/agent/tools/` : `list_files`, `read_file`, `write_file` (reuse files route logic / shared module).
- Prefer one of:
  - **A.** App-side tool loop if using an API provider later; or
  - **B.** Documented CLI contract (cwd + policy) + parse structured tool traces from CLI if available; or
  - **C.** Thin “host tools” channel: runtime invokes tools and feeds results back into next CLI/API call.
- Emit real `step` events with `kind: "read"` / write logs.

**Done when:** agent can read `workflow.md` without the user pasting it; writes land under `workspace/` and show in FileTree refresh.

### Phase 3 — Workflow domain tools + inbox coupling

- Single source of truth: either load/save workflow JSON/YAML from `workspace/**/**.workflow` **or** keep AppState but add server mirror API. Prefer disk-aligned SSOT so CLI and UI share files.
- Tools: `list_tasks`, `create_task`, `move_task`, `get_workflow`.
- On move into `humanGate` stage → append `InboxItem` (and optional activity).
- Optional: assignee agent auto-enqueue run (policy flag).

**Done when:** board and agent agree on task stages after a run; inbox badge moves without manual seed.

### Phase 4 — Skills runtime

- Skill package format on disk (e.g. `workspace/skills/<id>/SKILL.md` or under `src/lib/agent/skills` loaders).
- Enable toggle loads body into context and/or registers skill-scoped tools.
- Hub skill install copies files, not only localStorage rows.

**Done when:** toggling `yxt-workflow` off/on changes available tools or system text in a testable way.

### Phase 5 — Cron + webhook automation

- Server-side scheduler (or host process) reads cron store **outside** localStorage (file/SQLite/JSON under `.yxt/` or `workspace/.yxt/`).
- Each tick calls same runtime as chat with stored `agentId` + `prompt`; set `lastRun`.
- Webhook route: authenticated `POST` → enqueue same runtime; keep UI tab as manager not placeholder.

**Done when:** enabling a cron with `* * * * *` produces activity/messages without opening the browser UI (server process must be running).

### Phase 6 — Integrations / MCP / multi / memory / eval

- MCP: spawn/connect from integration config; map tools into tool bus (`providers/` + `tools/`).
- Multi-agent: handoff tool + optional graph (`multi/`) using existing agent list.
- Memory: durable notes / retrieval (`memory/`) scoped per agent/workspace.
- Eval: scripted fixtures against runtime (`eval/` + extend `verify-deepen` or sibling).

**Done when:** at least one external MCP tool appears as a live `step` and eval gate fails if context packing regresses.

### What not to do early

- Rewrite Moxt shell or replace localStorage UI state before Phase 3 SSOT decision.
- Fake more seed tool steps.
- Build Credits/cloud billing (out of product delta).
- Kill-and-replace CLI path before context packing works (CLI is the current LLM).

### Suggested dependency order (summary)

```
Phase0 contract
  → Phase1 context packing
  → Phase2 workspace tools
  → Phase3 workflow + inbox
  → Phase4 skills on disk
  → Phase5 cron/webhook (needs durable store + same runtime)
  → Phase6 MCP / multi / memory / eval
```

UI panels already present for Phases 1–5; work is almost entirely **behind** `WorkspaceApp.onSend`, `/api/agent/run`, and empty `src/lib/agent/*`, plus a durable store when leaving pure localStorage for automation.

---

## Appendix — Key paths (quick index)

```
package.json
README.md
scripts/verify-deepen.mjs
workspace/**
src/app/page.tsx
src/app/api/agent/run/route.ts
src/app/api/cli/list/route.ts
src/app/api/workspace/files/route.ts
src/lib/types.ts
src/lib/seed.ts
src/lib/cli-runner.ts
src/lib/file-tree.ts
src/lib/stream-markdown.ts
src/lib/markdown.tsx
src/lib/agent/{eval,memory,multi,providers,skills,tools}/   # empty
src/components/WorkspaceApp.tsx
src/components/SecondaryPanels.tsx
src/components/WorkflowPanel.tsx
src/components/IconRail.tsx
src/components/ChatSidebar.tsx
src/components/ChatPanel.tsx
src/components/chat/{Thread,Composer,Message,ThreadList}.tsx
src/components/workspace/FileTree.tsx
```
