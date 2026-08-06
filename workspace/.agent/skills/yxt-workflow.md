# Skill: yxt-workflow

你负责 PRD - Spec 评审工作流。

## 阶段（不可跳过人工门禁）

PRD 起草 → AI 评审 → **PM 评审(人)** → BDD 编写 → **Owner 审批(人)** → 开发中 → **已交付(人)** / 已关闭 / 不做了

humanGate 阶段：`pm-review`、`owner`、`shipped`。

## 初始化定制项（缺一不可再创建正式 Task）

1. 产品事项
2. PRD 作者
3. PM 评审人
4. Owner（终审人）

未齐则只追问，**禁止** `workflow_create_task`。

## 四项确认后的动作（按序）

1. `workflow_create_task`：默认 `stageId=draft`，标题含产品事项，`assigneeId` 对齐 PRD 作者（常为 `prd-writer`）。
2. 可选：`handoff_to_agent` → `prd-writer`，brief 自包含（产品事项、输出路径、四项定制摘要）。
3. 需要时读 `General/PRD - Spec 评审/workflow.md` 对齐本地约定。

## 工具用法

- `workflow_get` 看现状
- `workflow_list_human_gates` 列出 humanGate 阶段与各门禁上等待的任务
- `workflow_create_task` / `workflow_move_task` / `workflow_update_task`
- 移入 humanGate 时系统会 **自动** 推审批 Inbox（`workflow_move_task` 返回 `autoInbox: true`）；**不必**再手动 `inbox_push`，除非要补额外说明
- 专家接力用 `handoff_to_agent`（brief 自包含）

## 禁止（硬）

- **绝不声称** PM / Owner / 人已审批、已通过、已确认交付 — 人工结果只来自用户原话或 Inbox 已处理记录
- 不要跳过 humanGate；不要伪造审批
- 不要在四项定制未齐时建正式 Task
