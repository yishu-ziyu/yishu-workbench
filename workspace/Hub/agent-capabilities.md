# 本地 Agent 能力说明

奕枢工作台的 Agent 运行在本机：模型决策 + 工作区上下文 + 可调用工具。
产品壳在浏览器；工具副作用落在 `workspace/` 与 `workspace/.agent/`。

---

## 1. 能做什么（结论）

| 能力 | 现状 | 你怎么观察到 |
|------|------|----------------|
| 多轮工具循环（读文件、改看板、写 PRD） | 有 | 对话中出现 tool 步骤，磁盘/看板状态变化 |
| 按技能渐进加载业务约定 | 有 | `load_skill` 后行为对齐 skill 正文 |
| 多角色接力（写 / 评 / 交付） | 有 | `handoff_to_agent` 后换角色独立上下文 |
| 人工确认入 Inbox | 有 | humanGate 阶段出现 `inbox_push` 记录 |
| 跨会话记忆 | 有（轻量） | `memory_write` → `.agent/memory/` |
| 本地 CLI 回退（claude/codex/echo） | 有 | 未配模型 API 时仍可走 CLI / 回环 |
| 云端 Credits / 多租户沙箱 | 无 | 本产品不做 |
| 真实定时 Cron 调度进程 | UI 有、调度无 | 自动化页不能保证到点触发 |

---

## 2. 工具一览

注册入口：`src/lib/agent/loop.ts` → `ToolRegistry`。

### 2.1 工作区（perceive / execute）

| 工具 | 作用 |
|------|------|
| `list_workspace` | 列出 `workspace/` 下相对路径 |
| `search_workspace` | 按关键词搜文件内容 |
| `read_file` | 读文本文件（防 `..` 越界；可选 `offsetLine`/`limitLines`） |
| `write_file` | 写/覆盖工作区文件 |
| `edit_file` | 精确 `old_string`→`new_string` 替换（0/多匹配失败） |

### 2.2 工作流（业务核心）

| 工具 | 作用 |
|------|------|
| `workflow_get` | 读阶段 + 全部 Task |
| `workflow_list_human_gates` | 列出 humanGate 阶段与等待中的任务 |
| `workflow_create_task` | 建 Task（定制项齐后再用） |
| `workflow_move_task` | 改阶段；进人工门禁自动推 inbox |
| `workflow_update_task` | 改标题、摘要、优先级、负责人等 |

状态文件：`workspace/.agent/workflow-state.json`。
约定说明：`General/PRD - Spec 评审/workflow.md`。

### 2.3 协作与编排

| 工具 | 作用 |
|------|------|
| `inbox_push` | 推送待办/审批到人（`.agent/inbox.json`） |
| `handoff_to_agent` | 排队专家 Agent；brief 须自包含 |
| `get_status_bar` | 当前会话状态摘要 |

### 2.4 记忆

| 工具 | 作用 |
|------|------|
| `memory_write` | 持久化偏好 / 事实 / 流程（勿存密钥） |
| `memory_search` | 检索已存记忆 |

### 2.5 技能

| 工具 | 作用 |
|------|------|
| `load_skill` | 按 id 加载 skill 全文进上下文（渐进披露） |

危险工具默认需 `allowDangerous`；当前业务工具以工作区与看板为主。

---

## 3. Skills（业务技能包）

磁盘：`workspace/.agent/skills/`（首次运行 `ensureBundledSkills` 写入）。
系统提示里只放**索引**；全文靠 `load_skill`。

| id | 用途 |
|----|------|
| `yxt-workflow` | 九阶段、四项定制、人工门禁、工具用法 |
| `prd-write` | PRD 结构、落盘路径、写完移交评审 |
| `prd-review` | 独立评审清单；只评不写 |
| `deep-research-pro` | 先搜工作区与记忆再综合，带路径引用 |
| `humanizer` | 去掉空话套话，改成自然中文 |

可在同目录增加自定义 `*.md`；`index.json` 会合并展示。

---

## 4. 多 Agent 角色

编排：`src/lib/agent/multi/orchestrator.ts`。
主 Agent 跑完后执行其 `handoff_to_agent` 队列；**子 Agent 不共享完整聊天历史**，只收 brief + 可选产物路径。

| id | 名称 | 默认技能 | 职责 |
|----|------|----------|------|
| `momo` | 奕枢's momo | yxt-workflow, deep-research-pro | 编排、澄清定制、派发、推进阶段 |
| `prd-writer` | PRD 撰写员 | prd-write, humanizer | 起草 PRD / BDD，写入 workspace |
| `prd-reviewer` | PRD 评审员 | prd-review | 读后评审；打回交回 writer |
| `delivery` | 交付推进员 | yxt-workflow | 开发中 → 已交付与人工确认 |

API：`POST /api/agent/run` 可走单 Agent 循环或 `runMultiAgent`（见 route 实现）。

---

## 5. 运行时模块（给排查用）

| 模块 | 路径 | 职责 |
|------|------|------|
| 循环 | `src/lib/agent/loop.ts` | ReAct：模型 → tool_calls → 结果回注 |
| 上下文 | `src/lib/agent/context.ts` | system / 轨迹 / 压缩 |
| 轨迹 | `src/lib/agent/trajectory.ts` | 步骤与工具结果记录 |
| 模型适配 | `src/lib/agent/providers/openai-compat.ts` | OpenAI 兼容 + mock |
| 评估 | `src/lib/agent/eval/*` | 业务用例与 runner |
| 路径 | `src/lib/agent/paths.ts` | workspace / `.agent` 根路径 |

---

## 6. 评估与自检

```bash
pnpm test:agent
```

说明见 `workspace/.agent/eval/README.md`。
mock 用例不消耗真实模型额度，用于回归「初始化问定制」「建任务」「评审先读文件」「门禁 inbox」等。

---

## 7. 相关文档

| 文档 | 内容 |
|------|------|
| `General/PRD - Spec 评审/workflow.md` | 阶段与人工门禁操作指南 |
| `General/PRD - Spec 评审/通知中心重设计-prd.md` | 样例 PRD |
| `docs/agent-book/IMPLEMENTATION.md` | 书章节 → 代码模块映射 |
| `docs/agent-book/gap-analysis.md` | 能力缺口盘点（历史快照，以代码为准） |
