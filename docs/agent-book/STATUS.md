# Agent 打造进度（相对 AI Agent Book）

更新：2026-08-07

## 结论

奕枢工作台已是可运行的 **业务 Agent Runtime**：

```text
Agent = LLM + 上下文 + 工具
+ Harness（路径沙箱 / 密钥脱敏 / 阶段门 / 人闸 inbox / 熔断 / 工具预算 / 前缀冻结 / 轨迹 / 评估）
+ 业务（PRD-Spec 九阶段 · 四角色 · Skills · AGENTS 注入 · transfer_role）
```

## 关键数字

| 项 | 值 |
|----|-----|
| `pnpm test:agent` | **ALL PASS 29** |
| mock eval | **14/14** |
| 注册工具 | **21** |
| `src/lib/agent` LOC | **~5900** |
| `pnpm smoke:pipeline` | **PASS** |

## 验收证据（可复现）

| 门禁 | 状态 |
|------|------|
| `pnpm test:agent` | **ALL PASS 29**；mock eval **14/14** |
| `pnpm test:deepen` | 9/9 PASS |
| `pnpm smoke:agent` | PASS **Grok 4.5**（CLIProxy 8317）+ list_workspace |
| `pnpm smoke:prd` | PASS skill→read→workflow_get，四项定制 |
| `pnpm smoke:create-task` | PASS 确认后 create_task |
| `pnpm smoke:review` | PASS writer→reviewer 打回 |
| `pnpm smoke:handoff` | PASS handoff_to_agent |
| `pnpm smoke:ai-review` | PASS 结论 + move ai-review |
| `pnpm smoke:pipeline` | PASS momo 建任务 → writer 落盘 → reviewer 打回 + handoff |
| `pnpm cron:tick` | PASS 1-tick dry_run（verify 内嵌） |
| HTTP `:3456/api/agent/run` | PASS（load-env + failover） |

### 本轮已落地能力（verify 覆盖）

| 能力 | 证据 |
|------|------|
| `transfer_role` 共享上下文切角色 | eval `role-transfer-shared-context`；collab-tools |
| MCP stub | `list_mcp_servers` / `mcp_call`（not_configured） |
| cron-tick-loop | `scripts/cron-tick-loop.mjs` + verify 1-tick |
| `hasPrdVerdict` | `completion.ts`；评审结论门 |
| tool budget | `maxToolsPerRun` / `YXT_MAX_TOOLS` 软停 |
| prefix freeze | `buildStaticSystemPrefix` 字节稳定；动态状态栏分消息 |

## Smoke 脚本清单

| 命令 | 脚本 |
|------|------|
| `pnpm smoke:agent` | `scripts/smoke-agent-live.mjs` |
| `pnpm smoke:prd` | `scripts/smoke-prd-business.mjs` |
| `pnpm smoke:create-task` | `scripts/smoke-create-task.mjs` |
| `pnpm smoke:review` | `scripts/smoke-prd-review-loop.mjs` |
| `pnpm smoke:handoff` | `scripts/smoke-multi-handoff.mjs` |
| `pnpm smoke:pipeline` | `scripts/smoke-pipeline-prd.mjs` |
| `pnpm smoke:ai-review` | `scripts/smoke-ai-review-stage.mjs` |
| `pnpm smoke:all` | agent + prd + handoff |
| `pnpm cron:tick` | `scripts/cron-tick-loop.mjs` |
| `pnpm test:agent` | `scripts/verify-agent.mjs` |
| `pnpm test:deepen` | `scripts/verify-deepen.mjs` |

## 章节

| 章 | 状态 |
|----|------|
| 1 ReAct / Harness | 落地（工具预算、前缀冻结、熔断） |
| 2 上下文 | 落地（static/dynamic 拆分） |
| 3 记忆 / 知识 | 落地 |
| 4 工具 / 事件 | 落地（21 tools；MCP stub；cron tick 非常驻 daemon） |
| 5 Coding / FS | 落地（edit/glob/search） |
| 6 评估 | 落地（mock 14 + judge + 负例） |
| 7 后训练 | 延后 |
| 8 进化 | 落地（轨迹 harvest） |
| 9 多模态 | 未做 |
| 10 多 Agent | 落地（handoff + 对等评审 + transfer_role） |

## 业务迭代发现

- 评审员须 `结论：通过|有条件通过|打回`（`hasPrdVerdict`），避免只挪阶段不写结论。
- Stepfun 402 → MiniMax failover + `load-env` 读 ai-providers。

## 仍薄弱（最多 5）

1. 完成门 MAST（进 shipped 校验产物路径 + 评审轨迹）
2. Handoff schema 硬化（缺 brief/产物时拒绝）
3. 真 LLM 进 CI（配额可控 nightly）
4. Cron 常驻 daemon（现仅 tick API / 外置 loop）
5. 真 MCP 外接（现仅 stub）

## 命令

```bash
pnpm test && pnpm smoke:prd && pnpm smoke:handoff && pnpm smoke:pipeline
pnpm dev --port 3456
```

覆盖矩阵：`docs/agent-book/COVERAGE.md`
