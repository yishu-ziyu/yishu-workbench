# Agent Book 覆盖矩阵（P0）

更新：2026-08-07  
依据：`ch01-02-checklist.md` / `ch03-05-checklist.md` / `ch06-08-10-checklist.md`、`STATUS.md`、`IMPLEMENTATION.md`，对照 `src/lib/agent/**` 与 `src/app/api/**`。

## 一句结论

主路径 **ReAct + 并行工具 + workspace 中枢 + 四角色 handoff/transfer_role + 阶段门/人闸 + 前缀冻结 + 工具预算 + mock 评估** 已可跑。

| 门禁 | 值 |
|------|-----|
| `verify-agent` | **ALL PASS 29** |
| mock eval | **14/14** |
| tools | **21** |
| agent LOC | **~5900** |
| pipeline smoke | **PASS** |

## 领土快照

```text
src/lib/agent/  (~5900 LOC)
  loop.ts, context.ts, completion.ts, types.ts, trajectory.ts, evolution.ts
  guardrails.ts, gates.ts, paths.ts, load-env.ts, agents.ts
  providers/openai-compat.ts
  skills/loader.ts
  tools/{registry,workspace,workflow,memory,collab,shell,mcp-stub}-tools.ts
  multi/orchestrator.ts
  eval/{cases,judge,runner,multi-runner}.ts
  events/{cron-store,cron-tick}.ts

src/app/api/
  agent/{run,skills,trajectories,crons,crons/tick,inbox,memory}/route.ts
  workspace/{files,workflow}/route.ts

scripts/
  verify-agent.mjs, verify-deepen.mjs, cron-tick-loop.mjs
  smoke-{agent-live,prd-business,create-task,prd-review-loop,
         multi-handoff,pipeline-prd,ai-review-stage}.mjs
```

### 工具清单（21）

| 组 | 名称 |
|----|------|
| workspace | list_workspace, read_file, write_file, edit_file, search_workspace, glob_workspace |
| workflow | workflow_get, workflow_list_human_gates, workflow_create_task, workflow_move_task, workflow_update_task |
| memory | memory_write, memory_search |
| collab | inbox_push, handoff_to_agent, transfer_role, get_status_bar |
| shell | shell_exec |
| skill | load_skill |
| MCP stub | list_mcp_servers, mcp_call |

状态口径：

| 状态 | 含义 |
|------|------|
| **DONE** | 有可运行实现，核心验收可在仓库内观察 |
| **PARTIAL** | 有子集/骨架，缺关键验收 |
| **TODO** | 无实质实现 |

---

## Ch1–Ch2 P0

| ID | 名称 | 状态 | 证据路径 |
|----|------|------|----------|
| 1.1 | 四角色消息 + 顶层 tools | **DONE** | `types.ts`；`providers/openai-compat.ts` |
| 1.2 | 静态前缀 + 轨迹只追加 | **DONE** | `buildStaticSystemPrefix` 同输入字节稳定；`assembleMessages` 静态/动态分 system；verify：`buildStaticSystemPrefix stable` |
| 1.3 | Assistant 三部件 | **PARTIAL** | content + tool_calls；无独立 reasoning 字段 |
| 1.4 | tool_call_id 关联 | **DONE** | `loop.ts` |
| 1.5 | 无状态全量历史回传 | **DONE** | `loop.ts` |
| 1.6 | 禁止自拼纯文本多轮 | **DONE** | 标准 role 消息 |
| 2.1 | ReAct 核心循环 | **DONE** | `runAgentLoop` |
| 2.2 | 同轮多工具并行 | **DONE** | 非 dangerous `Promise.all` |
| 2.3 | 停机：max_iter / 终答 / 错误 | **DONE** | + `stuck_loop` + **tool budget**（`maxToolsPerRun`/`YXT_MAX_TOOLS`） |
| 3.1 | 工具注册 + schema | **DONE** | `registry.ts` + 21 tools |
| 4.1 | 静态前缀不可变 | **DONE** | static 冻结 + verify；动态状态栏/记忆在第二 system |
| 4.2 | 动态信息只追加末尾 | **PARTIAL** | 第二 system 承载状态栏；非尾部 user 槽 |
| 6.1 | 故障安全默认关 | **PARTIAL** | shell dangerous + allowDangerous；写文件默认可执行 |
| 8.1 | 自主 ReAct | **DONE** | `/api/agent/run` |
| 12.1 | 统一 Chat 客户端 | **DONE** | openai-compat + failover |
| 12.3 | Next.js `/api/agent/run` | **DONE** | agent / multi / CLI |

---

## Ch3–Ch5 P0

| ID | 名称 | 状态 | 证据路径 |
|----|------|------|----------|
| C3-01 | 轨迹 vs 长期记忆 | **PARTIAL** | trajectories/ + memory/；无会话结束自动提取 |
| C3-02 | 会话后 distill | **PARTIAL** | `maybeDistillEpisode`：成功且用过 write_file/workflow_create_task 写 episode；无 LLM 抽取 |
| C3-03 | Notes + 卡片 | **PARTIAL** | JSON kind/tags；无 MEMORY.md 双格式 |
| C3-09 | Workspace 文件中枢 | **DONE** | workspace-tools + assertSafePath |
| C3-14 | Agentic RAG | **PARTIAL** | search_workspace 可多轮；无强制协议 |
| C3-17 | 来源标记 + 注入隔离 | **DONE** | wrapSourceContent + redactSecrets |
| C4-01 | 五类工具标注 | **DONE** | ToolSpec.category |
| C4-02 | 七件套感知-执行 | **DONE** | list/read/write/edit/search/glob/shell；无 code_interpreter |
| C4-03 | Skill 优先 | **DONE** | load_skill + bundled |
| C4-04 | 工具描述规范 | **PARTIAL** | 无统一 when_not 校验器 |
| C4-05 | 参数保真 | **DONE** | JSON 直通 |
| C4-06 | 分页 / 截断 | **DONE** | read_file offsetLine/limitLines |
| C4-07 | 执行安全分层 | **DONE** | assertSafePath；危险 shell 默认拒 |
| C4-13 | humanGate HITL | **DONE** | auto pushInbox；eval human-gate-inbox |
| C4-MCP | MCP 发现/调用 | **PARTIAL** | `mcp-stub.ts`：list + call stub；真协议未接 |
| C5-01 | FS 为内核 | **DONE** | cwd=workspace/ |
| C5-02 | Sessionless 持久 | **DONE** | `.agent/*` |
| C5-03 | AGENTS.md 注入 | **DONE** | loadProjectInstructions |
| C5-05 | Harness 边界/反馈 | **PARTIAL** | 路径黑名单 + 阶段门；无写后自动备份 |
| C5-06 | 死循环检测 | **DONE** | 3× 同签名 stuck_loop；verify circuit breaker |
| C5-10 | edit old→new | **DONE** | edit_file |
| C5-11 | grep + glob | **DONE** | search_workspace + **glob_workspace** |
| C5-12 | 致命三要素 | **PARTIAL** | redact 有；MEMORY 信任审查无 |
| C5-15 | 业务规则代码化 | **PARTIAL** | canEnterStage + **hasPrdVerdict**；跃迁表未全表化 |

---

## Ch6 / Ch8 / Ch10 P0

| ID | 名称 | 状态 | 证据路径 |
|----|------|------|----------|
| E6-01 | 可重置评估环境 | **PARTIAL** | eval/runner + mock；无环境 hash API |
| E6-03 | PRD 评估数据集 | **PARTIAL** | **14** mock cases（含 transfer_role / human_gates / 三负例）；非 datasets/ 参数化目录 |
| E6-04 | 指标词典 | **PARTIAL** | heuristicJudge；无 Pass@k 总分否决契约 |
| E6-05 | 轨迹 vs 结果双覆盖 | **DONE** | expectTools + expectContains；负例含 skip-gate / path-escape / **oral-ship-claim** → **14/14** |
| E6-06 | Rubric LLM-as-Judge | **PARTIAL** | llmJudge 可选；无五维 rubric 文件 |
| E6-08 | Trace / Span | **PARTIAL** | 轨迹 JSON + NDJSON；无父子 span |
| E8-01 | 三层轨迹验证器 | **PARTIAL** | deriveSignals 近似 |
| E8-02 | 信号与进化分离 | **DONE** | persistTrajectory 在线；evolution 离线 |
| M10-01 | 共享/隔离上下文 | **PARTIAL** | handoff 默认隔离；**transfer_role 共享历史**；无 hybrid 配置字段 |
| M10-02 | 角色注册表 | **DONE** | BUSINESS_AGENTS |
| M10-03 | momo Orchestrator | **PARTIAL** | runMultiAgent；无完整 spawn 取消 |
| M10-04 | Writer↔Reviewer | **PARTIAL** | runProposerReviewer + live smoke；无强制 Rubric 结 stage |
| M10-05 | 阶段角色转换 | **DONE** | **transfer_role** + eval role-transfer-shared-context |
| M10-06 | 隔离 Handoff 包 | **PARTIAL** | brief + artifactPaths 落盘；schema 未硬化拒绝 |
| M10-08 | 虚拟 FS 四区 | **PARTIAL** | 无 per-agent scratch |
| M10-13 | 完成判定门 MAST | **TODO** | 无产物存在性完成验证器 |

---

## 汇总计数（上表 P0 行，含 C4-MCP）

| 状态 | 约计 |
|------|------|
| DONE | 33 |
| PARTIAL | 22 |
| TODO | 2 |

验收门禁：

| 检查 | 结果 |
|------|------|
| `node scripts/verify-agent.mjs` | **ALL PASS 29**（含 mock 14/14、prefix freeze、hasPrdVerdict、tool budget、MCP stub、glob、cron-tick-loop） |
| mock eval | **14/14** |
| tools | **21** |
| live smoke | agent / prd / create-task / review / handoff / pipeline / ai-review |
| cron | `cron-tick-loop.mjs` dry_run；API `/api/agent/crons/tick` |

**说明**：mock 绿 ≠ 书中全部 P0 完成。

---

## 下一迭代 Top 5 TODO

1. **完成门 MAST** — 进 shipped/交付前校验产物路径 + 可选评审轨迹；补全非法跃迁表（M10-13 / C5-15）。
2. **Handoff schema 硬化** — 缺验收标准/产物路径拒绝；挂 parent trajectory id（M10-06）。
3. **真 LLM 回归进 CI** — live smoke nightly，固定模型与费用上限。
4. **Cron 常驻 daemon** — tick API / 外置 loop 之外的进程调度与 due 可观测。
5. **真 MCP 外接** — 替换 stub；list/call 接 Integrations（C4-MCP）。

---

## 明确非覆盖

- Ch7 后训练 / 参数更新
- Ch9 多模态实时 / Computer Use
- 完整 A2A
- 书中教学 BM25/ANN 自实现

---

## 相关文档

| 文件 | 用途 |
|------|------|
| `docs/agent-book/STATUS.md` | 进度与怎么跑 |
| `docs/agent-book/IMPLEMENTATION.md` | 章 → 模块索引 |
| `docs/agent-book/gap-analysis.md` | 历史基线；以本矩阵与源码为准 |
| `docs/agent-book/ch*-checklist.md` | 完整需求与 P1/P2 |
