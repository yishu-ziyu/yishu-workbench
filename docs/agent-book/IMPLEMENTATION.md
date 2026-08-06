# 书章节 → 代码模块映射

来源：`ai-agent-book` 相关章与本仓 `docs/agent-book/*-checklist.md`。  
范围：已落到 `src/lib/agent/` 的实现索引（短表）。细节需求仍以 checklist / 源码为准。

```text
Agent = Model + Harness
Harness ≈ context + tools + skills + constraints + eval + multi
```

---

## 总表

| 章 | 主题（书） | 本仓模块 | 说明 |
|----|------------|----------|------|
| **1** | Agent 公式 / ReAct / Harness / 停机 | `loop.ts`, `types.ts`, `trajectory.ts` | 工具循环、轨迹步骤、最大迭代与退出 |
| **2** | 上下文工程 / 消息角色 / Skills 渐进披露 / 压缩 | `context.ts`, `skills/loader.ts`, `providers/openai-compat.ts` | system+tools 静态前缀；`load_skill`；`compressMessages` |
| **3** | 记忆与检索（生产裁剪） | `tools/memory-tools.ts`, `memory/`（目录预留） | `memory_write` / `memory_search`；轻量 JSON 持久化，非完整 RAG 栈 |
| **4** | 工具：感知 / 执行 / 协作 | `tools/workspace-tools.ts`, `tools/workflow-tools.ts`, `tools/collab-tools.ts`, `tools/registry.ts` | 文件与看板；`inbox_push` / `handoff_to_agent` / `get_status_bar` |
| **5** | 规划与状态（业务工作流） | `tools/workflow-tools.ts`, `paths.ts` | 九阶段状态机落盘 `.agent/workflow-state.json`；约定见 workspace 内 workflow.md |
| **6** | 评估环境 / 用例 / 双检 | `eval/cases.ts`, `eval/runner.ts` | mock 业务用例；`pnpm test:agent` → `scripts/verify-agent.mjs` |
| **8** | 可观测与轨迹（实现子集） | `trajectory.ts`, `loop.ts` 事件流 | 步骤 / tool 结果；API NDJSON 事件（route 层） |
| **10** | 多 Agent 编排与隔离 handoff | `multi/orchestrator.ts` | `BUSINESS_AGENTS`；主 Agent + 独立 brief 子运行 |

第 7 章后训练、第 9 章等未在本表展开：当前明确不落在线调参；以 Harness 与多角色主路径为先（见 `ch06-08-10-checklist.md` deferred 说明）。

---

## 目录速查

```text
src/lib/agent/
  loop.ts                 # Ch1 ReAct 主循环
  context.ts              # Ch2 上下文组装与压缩
  types.ts                # 消息 / 工具 / 运行请求类型
  trajectory.ts           # Ch1/8 轨迹
  paths.ts                # workspace 与 .agent 路径
  providers/
    openai-compat.ts      # Ch2 模型适配 + mock provider
  skills/
    loader.ts             # Ch2 Skills 索引 / 加载 / 内置正文
  tools/
    registry.ts           # 注册与执行、危险工具开关
    workspace-tools.ts    # Ch4 感知+文件执行
    workflow-tools.ts     # Ch4/5 业务看板
    memory-tools.ts       # Ch3 记忆
    collab-tools.ts       # Ch4 协作与 handoff 入口
  multi/
    orchestrator.ts       # Ch10 多角色
  eval/
    cases.ts              # Ch6 用例
    runner.ts             # Ch6 执行与报告
  memory/                 # 预留（持久化现多在 tools + .agent/memory）
```

---

## 业务锚点（非书、但验收相关）

| 锚点 | 路径 |
|------|------|
| 工作流操作指南 | `workspace/General/PRD - Spec 评审/workflow.md` |
| 样例 PRD | `workspace/General/PRD - Spec 评审/通知中心重设计-prd.md` |
| 能力说明 | `workspace/Hub/agent-capabilities.md` |
| 评估怎么跑 | `workspace/.agent/eval/README.md` |
| 角色 | momo / prd-writer / prd-reviewer / delivery |

---

## 验证

```bash
pnpm test:agent
```

通过标准：脚本内静态断言 + mock 评估 `failed === 0`。  
活模型与完整 LLM-as-Judge 不在默认门禁内。
