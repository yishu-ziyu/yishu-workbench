# PRD - Spec 评审 · 操作指南

本文件是本地工作流的约定说明。
Agent 与人共用同一套阶段、人工确认点、工具与完成标准。
看板状态落在 `workspace/.agent/workflow-state.json`；本目录放 PRD 正文与本指南。

---

## 1. 阶段一览

```text
PRD 起草
  → AI 评审
  → PM 评审（人）
  → BDD 编写
  → Owner 审批（人）
  → 开发中
  → 已交付（人）
  → 已关闭
  ↘ 不做了（任意阶段可转入）
```

| 阶段 id | 显示名 | 谁推进 | 人工确认 | 进入本阶段时要做什么 |
|---------|--------|--------|----------|----------------------|
| `draft` | PRD 起草 | prd-writer / 人 | 否 | 写/改 PRD 文件；四项定制齐后才建正式 Task |
| `ai-review` | AI 评审 | prd-reviewer | 否 | 只读 PRD，给通过/有条件通过/打回；不代写正文 |
| `pm-review` | PM 评审 | **人** | **是** | Agent 停在此阶段，`inbox_push` 请 PM 确认 |
| `bdd` | BDD 编写 | prd-writer | 否 | 把验收写成 When I do X / I see Y |
| `owner` | Owner 审批 | **人** | **是** | 终审范围与优先级；Agent 不得伪造已批 |
| `dev` | 开发中 | 人 / delivery | 否 | 按已批 PRD+BDD 实现；范围变更回起草或 Owner |
| `shipped` | 已交付 | **人** | **是** | 对照验收逐条点检后才确认交付 |
| `closed` | 已关闭 | 人 | 否 | 归档；不再改需求 |
| `wont` | 不做了 | 人 | 否 | 写清原因；Task 停在此列 |

人工确认点（humanGate）：**PM 评审**、**Owner 审批**、**已交付**。
进入这些阶段时，Agent 必须 `inbox_push`，不得自行标为「已通过」。

---

## 2. 定制项（建正式 Task 前必填）

缺任何一项，只追问，不创建正式 Task：

1. **产品事项** — 这次要解决什么产品问题（一句话即可）
2. **PRD 作者** — 谁写正文（人的名字或 prd-writer）
3. **PM 评审人** — 谁在 PM 评审阶段拍板
4. **Owner（终审人）** — 谁在 Owner 审批阶段拍板

示例（与样例 PRD 对齐）：

| 项 | 值 |
|----|-----|
| 产品事项 | 通知中心重设计 |
| PRD 作者 | 奕枢 |
| PM 评审人 | 奕枢 |
| Owner | 奕枢 |

---

## 3. 工具对照

Agent 通过工具读写工作区与看板；人可用工作台 UI 或直接改文件。

| 目的 | 工具 | 说明 |
|------|------|------|
| 看看板与全部任务 | `workflow_get` | 读 `.agent/workflow-state.json` |
| 建任务 | `workflow_create_task` | 四项定制确认后；默认进 `draft` |
| 改阶段 / 字段 | `workflow_move_task` / `workflow_update_task` | 进 humanGate 时必须配合 `inbox_push` |
| 列目录 / 搜文件 | `list_workspace` / `search_workspace` | 发现 PRD、本指南、Hub 文档 |
| 读 / 写 PRD | `read_file` / `write_file` | 路径相对 `workspace/`，禁止 `..` |
| 加载业务约定 | `load_skill` | 常用：`yxt-workflow`、`prd-write`、`prd-review` |
| 请人确认 | `inbox_push` | kind 建议 `approval`；标题写清任务与阶段 |
| 专家接力 | `handoff_to_agent` | brief 自包含；可带 `artifactPaths` |
| 记跨会话事实 | `memory_write` / `memory_search` | 偏好、流程约定；不写密钥 |
| 看当前状态摘要 | `get_status_bar` | 会话内简要状态 |

角色默认技能：

| Agent | 主要技能 | 职责 |
|-------|----------|------|
| momo | yxt-workflow, deep-research-pro | 编排、定制确认、派发、阶段推进 |
| prd-writer | prd-write, humanizer | 起草 PRD、写 BDD、落盘 |
| prd-reviewer | prd-review | 独立评审，只评不写 |
| delivery | yxt-workflow | 开发中 → 已交付 与人工确认 |

---

## 4. 推荐操作顺序

### 4.1 初始化

1. 读本文件（`read_file` → `General/PRD - Spec 评审/workflow.md`）。
2. 需要时 `load_skill` → `yxt-workflow`。
3. 向用户确认四项定制；未齐则停。
4. `workflow_create_task`：标题如「通知中心重设计 PRD」，`stageId=draft`，`assigneeId=prd-writer`。

### 4.2 起草 → AI 评审

1. momo `handoff_to_agent` → prd-writer，brief 含产品事项与输出路径。
2. prd-writer 写 `General/PRD - Spec 评审/<slug>-prd.md`。
3. `workflow_move_task` → `ai-review`，handoff → prd-reviewer。
4. 评审员 `read_file` 后输出：通过 / 有条件通过 / 打回。
5. 打回：回 `draft` + handoff 回 prd-writer；通过：进 `pm-review` + `inbox_push`。

### 4.3 人工门禁（PM / Owner / 已交付）

1. `workflow_move_task` 进入对应阶段。
2. 立刻 `inbox_push`（title 含任务名 + 阶段，body 含 PRD 路径与待确认点）。
3. **等待真人在工作台 Inbox 处理**；Agent 不得假定已批。
4. 人确认后，Agent 才可移到下一阶段（PM 通过 → `bdd`；Owner 通过 → `dev`；交付确认 → `closed` 或保持 `shipped` 后归档）。

### 4.4 BDD → 开发 → 关闭

1. BDD：验收写成可点检的 When / Then；可写在 PRD 内或独立小节。
2. Owner 审批通过后进入 `dev`。
3. 实现完成后移到 `shipped`，再次 `inbox_push` 请人按验收点检。
4. 点检通过 → `closed`；明确放弃 → `wont` 并写原因。

---

## 5. 禁止事项

- 伪造 PM / Owner / 交付已确认。
- 跳过 humanGate 或未 `inbox_push` 就推进。
- 未确认四项定制就建正式 Task。
- 评审员代写 PRD 正文。
- 把密钥、token、cookie 写入 memory 或 PRD。

---

## 6. 定制清单（复制用）

新建一条产品事项时，先填再开 Task：

```text
- [ ] 产品事项：
- [ ] PRD 作者：
- [ ] PM 评审人：
- [ ] Owner：
- [ ] 输出路径建议：General/PRD - Spec 评审/<slug>-prd.md
- [ ] 优先级：high | medium | low
- [ ] 初始负责人：prd-writer | 本人
```

可选本地约定（写入 memory 或本目录备注）：

```text
- [ ] 评审 SLA（例如 PM 2 个工作日）
- [ ] 是否需要设计稿链接
- [ ] 关联系统 / 依赖接口
```

---

## 7. 示例验收（怎样算这条工作流跑通）

以「通知中心重设计」为例，可观察结果：

| 步骤 | 我做了什么 | 我应看到什么 |
|------|------------|--------------|
| 初始化 | 对 momo 说：阅读 workflow 并初始化 | 追问四项定制，**没有**直接建空任务 |
| 建任务 | 回复四项齐全 | 看板 `draft` 出现「通知中心重设计…」类任务 |
| 起草 | 请 prd-writer 写 PRD | 磁盘出现 `…/通知中心重设计-prd.md`，含问题/目标/non-goals/验收 |
| AI 评审 | 请 prd-reviewer 评审 | 先读文件再给结论；打回不直接改正文 |
| PM 门禁 | 任务进入 PM 评审 | Inbox 出现待审批项；未点确认前阶段不变 |
| BDD | 补充验收用例 | PRD 内可见 When I do X / I see Y |
| Owner 门禁 | 进入 Owner 审批 | 再次 Inbox；确认后才可进开发中 |
| 交付 | 开发完成进已交付 | Inbox 请人按验收点检；通过后可关单 |

自动化对照：`pnpm test:agent` 中 mock 用例覆盖「初始化要定制」「确认后建任务」「评审先读文件」「humanGate 推 inbox」等行为（见 `workspace/.agent/eval/README.md`）。

---

## 8. 相关路径

| 路径 | 用途 |
|------|------|
| `General/PRD - Spec 评审/workflow.md` | 本操作指南 |
| `General/PRD - Spec 评审/PRD - Spec 评审.workflow` | 阶段列表（轻量声明） |
| `General/PRD - Spec 评审/*-prd.md` | PRD 正文 |
| `workspace/.agent/workflow-state.json` | 任务与阶段运行时状态 |
| `workspace/.agent/inbox.json` | 人工确认队列 |
| `workspace/.agent/skills/` | 技能全文（按需 load） |
| `workspace/Hub/agent-capabilities.md` | Agent 能力总表 |
