# 奕枢的工作台

Web-first **Agent 工作台**（对齐 Moxt 产品面：对话 / 工作空间 / AI 同事 / 工作流看板 / 技能 / 自动化 / 集成 / 资源广场）。

内部代号曾用 `yxt`。算力路径：**默认 Grok 4.5**（本机 CLIProxy `127.0.0.1:8317`，见 `docs/agent-book/GROK45.md` / 桌面 `AI组件工作流库`）；失败再 failover MiniMax / Stepfun。CLI（`claude` / `codex` / echo）仍可回落。

## 核心公式（AI Agent Book）

```text
Agent = LLM + 上下文 + 工具
生产竞争力 = Model + Harness（约束 / 验证 / 纠正 / 轨迹）
```

实现见 `src/lib/agent/`，章节映射与覆盖矩阵见 `docs/agent-book/`。

## 本地运行

```bash
cd "/Users/mahaoxuan/Desktop/奕枢/奕枢的工作台"
pnpm install
pnpm dev --port 3456
```

打开 http://localhost:3456  

API 会自动读取 `~/.config/ai-providers/env.local`（不覆盖已有环境变量）。默认 `YXT_LLM_PREFER=minimax`。

## 验证

```bash
pnpm test              # deepen + agent
pnpm test:agent        # mock eval 9/9 + multi + guardrails + cron + gates
pnpm smoke:agent       # 真 LLM + list_workspace
pnpm smoke:prd         # 真 LLM 业务：skill + workflow.md + workflow_get
node scripts/smoke-prd-review-loop.mjs  # writer → reviewer 对等协作
```

## 结构摘要

| 路径 | 作用 |
|------|------|
| `src/lib/agent/loop.ts` | ReAct 核心循环（可并行工具） |
| `src/lib/agent/context.ts` | system / skills / memory / 状态栏 / AGENTS 注入 |
| `src/lib/agent/tools/*` | 感知·执行·协作·用户沟通工具 |
| `src/lib/agent/multi/` | momo / prd-writer / prd-reviewer / delivery |
| `src/lib/agent/eval/` | 业务 mock 评估 + judge |
| `src/lib/agent/events/` | cron 事件骨架 |
| `workspace/.agent/` | 记忆、轨迹、skills、workflow SSOT、inbox |
| `workspace/General/PRD - Spec 评审/` | 业务主线文档 |

## 业务主线

PRD-Spec 九阶段：起草 → AI 评审 → **PM 人闸** → BDD → **Owner 人闸** → 开发 → **交付确认** / 关闭 / 不做了。

Agent 在未确认「产品事项 / PRD 作者 / PM / Owner」前不得瞎建正式 Task。
