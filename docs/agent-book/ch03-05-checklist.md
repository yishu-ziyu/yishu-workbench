# AI Agent Book Ch.3–5 → 奕枢的工作台 可落地清单

来源：`/Users/mahaoxuan/Desktop/AI产品经理/ai-agent-book/book/chapter{3,4,5}.md`  
范围：local-first PM 工作台（`workspace/` 文件、PRD/workflow、会话 Agent）  
排除：模型训练、机器人/VLA、多租户云沙箱选型长文、纯教学复现（BM25 手写、AIME 评测等）  
原则：每条可验收；模块路径对齐现有骨架（`src/lib/agent/*`、`workspace/`、`src/app/api/*`）

---

## 书内实验名（仅索引，不照搬实现）

### Chapter 3
| 编号 | 实验名 | 配套项目 |
|------|--------|----------|
| 3-1 | 用三层次框架评估记忆系统 | user-memory / user-memory-evaluation |
| 3-2 | 记忆策略的对比实验研究 | user-memory / mem0 / memobase |
| 3-3 | 基于本地模型的智能日志脱敏 | log-sanitization |
| 3-4 | 向量检索服务：ANN 索引比较 | dense-embedding |
| 3-5 | 从零实现 BM25 | sparse-embedding |
| 3-6 | 混合检索流水线 | retrieval-pipeline |
| 3-7 | 多模态信息提取三种范式 | multimodal-agent |
| 3-8 | RAPTOR 与 GraphRAG 结构化索引 | structured-index |
| 3-9 | 智能体化 vs 非智能体化 RAG | agentic-rag |
| 3-10 | 用 Agentic RAG 构建用户记忆 | agentic-rag-for-user-memory |
| 3-11 | 上下文感知检索 | contextual-retrieval |
| 3-12 | 上下文感知检索增强用户记忆 | contextual-retrieval-for-user-memory |
| 3-13 | 结构化数据隐性知识提取 | structured-knowledge-extraction |

### Chapter 4
| 编号 | 实验名 | 配套项目 |
|------|--------|----------|
| 4-1 | 感知工具 MCP 服务器 | perception-tools |
| 4-2 | 执行工具 MCP 服务器 | execution-tools |
| 4-3 | 协作工具 MCP 服务器 | collaboration-tools |
| 4-4 | 事件驱动的邮件处理 Agent | agent-with-event-trigger |
| 4-5 | 并行执行与打断的异步 Agent | async-agent |
| 4-6 | 主动工具发现 | active-tool-discovery (+ active-tool-selection) |

### Chapter 5
| 编号 | 实验名 | 配套项目 |
|------|--------|----------|
| 5-1 | 代码辅助数学解题 | code-for-math |
| 5-2 | 代码辅助逻辑思考 | code-for-logic |
| 5-3 | 小模型 + 代码化规则 | small-model-codified-rules |
| 5-4 | 论文 → PPT | paper-to-ppt |
| 5-5 | 论文讲解视频 | paper-to-video |
| 5-6 | 智能视频剪辑 | video-edit |
| 5-7 | 自适应日志解析 | adaptive-log-parser |
| 5-8 | 生产日志智能诊断 | log-diagnosis |
| 5-9 | 动态表单意图澄清 | dynamic-form |
| 5-10 | 自然语言 ERP Agent | erp-agent |
| 5-11 | 对话式界面定制 | conversational-ui |
| 5-12 | 能创造 Agent 的 Agent | agent-creator |

---

## 优先级约定

| 级 | 含义 |
|----|------|
| **P0** | 没有就不能当「本地工作区 + Agent 写 PRD/workflow」用 |
| **P1** | 显著提升正确率/安全/跨会话体验；产品成型后优先 |
| **P2** | 差异化或规模化后需要；可后置 |

---

## Chapter 3 · 用户记忆与知识库

### C3-01 轨迹（Trajectory）与长期记忆分层
- **Principle**: 单次运行轨迹 append-only；跨会话事实进用户长期记忆。二者不混写。
- **Acceptance**:
  - 一次 Agent run 的 user/assistant/tool 事件可按时间完整回放，且历史条目不可被就地改写。
  - 会话结束后可触发记忆提取；新会话默认不带入完整轨迹，只按需加载长期记忆。
- **Module**: `src/lib/agent/memory/`（trajectory store）；会话侧可挂 `src/lib/types.ts` Conversation
- **Priority**: P0

### C3-02 选择性记忆提取（会话后 distill）
- **Principle**: 投入额外 LLM 调用，从对话抽出对未来有用的事实；丢弃临时工具噪声。
- **Acceptance**:
  - 结束或空闲阈值后生成候选记忆列表（偏好 / 约束 / 账号类元数据 / 近期活动可配置）。
  - 候选可审查（人可删改）再落盘；不自动把整段 chat dump 当记忆。
- **Module**: `src/lib/agent/memory/`（extract pipeline）
- **Priority**: P0

### C3-03 混合存储格式（Notes + 结构化卡片）
- **Principle**: 关键少量子用 Advanced/JSON Cards；大量对话事实用 Simple/Enhanced Notes。
- **Acceptance**:
  - 至少支持：原子 note（单事实）+ 结构化 card（如 `work.position` 部分更新）。
  - 用户可在 `workspace/` 下直接打开 Markdown/JSON 查看并手改。
- **Module**: `workspace/**/MEMORY.md` 或 `workspace/.agent/memories/`；`src/lib/agent/memory/`
- **Priority**: P0

### C3-04 记忆更新四态（ADD / UPDATE / DELETE / NOOP）
- **Principle**: 新事实与旧记忆对账，避免矛盾并存（Mem0 流水线）。
- **Acceptance**:
  - 用户说「我改住上海」后，旧「住北京」被 UPDATE 或 DELETE，检索不再返回冲突双值。
  - 每条决策可日志：reason + before/after。
- **Module**: `src/lib/agent/memory/`（reconcile）
- **Priority**: P1

### C3-05 三层记忆能力验收（基础 / 多会话 / 主动）
- **Principle**: 用可测层级定义「记忆好不好」，而非只堆存储。
- **Acceptance**:
  - L1：直接说过的结构化事实，后续精确答出。
  - L2：跨会话/跨对象（如两份 PRD、两套评审人）能全部召回并澄清，而非瞎猜一个。
  - L3（可选目标）：综合久前事实主动预警（如「护照类」映射为「评审截止日 vs 未定稿 PRD」）。
  - 有最小 fixture 用例目录，可跑 judge 或人工清单。
- **Module**: `src/lib/agent/eval/`；fixture 可放 `docs/agent-book/fixtures/memory/`
- **Priority**: P1（L1 P0 隐含）

### C3-06 情景 / 语义 / 程序记忆分型（轻量）
- **Principle**: 事件流水、稳定偏好、可复用流程分通道存与检索。
- **Acceptance**:
  - 至少：semantic（偏好、角色）常驻摘要；episodic（某次评审决策）按时间可查；procedural（workflow 步骤 skill）走 Skills 目录。
  - Agent 问「上次 Spec 评审结论」走 episodic，不误用 semantic 模板。
- **Module**: `src/lib/agent/memory/` + `src/lib/agent/skills/` + `workspace/**/*.workflow`
- **Priority**: P1

### C3-07 记忆压缩与整理
- **Principle**: 重要性评分 + 聚类摘要 + 抽象泛化，防止记忆爆炸。
- **Acceptance**:
  - 超过阈值的 note 可归档/摘要；重复 note 合并。
  - 压缩后 L1 召回不显著下降（手测 checklist 即可）。
- **Module**: `src/lib/agent/memory/`（compact job）
- **Priority**: P2

### C3-08 日志与记忆脱敏（PII）
- **Principle**: 敏感信息进 LLM/日志前脱敏；本地优先。
- **Acceptance**:
  - 密钥、手机号、身份证等模式可检测；写入 trajectory 前可 mask。
  - 脱敏策略可配置；不把 raw secret 写进 `MEMORY.md`。
- **Module**: `src/lib/agent/memory/` 或 `src/lib/agent/tools/`（sanitize）；书实验 3-3
- **Priority**: P1

### C3-09 Workspace 文件系统知识库（Markdown 中枢）
- **Principle**: 知识/记忆/产物以 `workspace/` 文件为中枢；人可读、Git 可回滚（OpenClaw / OpenViking 思路）。
- **Acceptance**:
  - Agent 与 UI 读写同一树：`src/app/api/workspace/files` 与 Agent 工具路径一致。
  - 路径逃逸被拒绝（已有 safeJoin 模式需在 Agent 工具侧复用）。
  - 关键知识有入口索引页（目录 README / index），非孤岛文件堆。
- **Module**: `workspace/`；`src/app/api/workspace/files/`；`src/lib/file-tree.ts`；`src/lib/agent/tools/`
- **Priority**: P0

### C3-10 L0/L1/L2 渐进披露（摘要 → 概览 → 全文）
- **Principle**: 资源写入时生成短摘要与概览；Agent 先扫 L0/L1 再按需读 L2。
- **Acceptance**:
  - 每个 PRD/长文档旁可有 `.abstract` 或 frontmatter summary（~100 token）与 overview（~2k）。
  - 工具 `list/search` 默认返回 L0/L1；`read` 才取全文。
- **Module**: `workspace/**`；`src/lib/agent/tools/`（read/list）；`src/lib/agent/skills/`
- **Priority**: P1

### C3-11 条目互链与索引维护
- **Principle**: 新知识写入时强制链接已有条目并更新目录索引，避免孤岛。
- **Acceptance**:
  - 写入 skill/记忆/PRD 时提示词或校验要求：至少一条 backlink 或 index 更新。
  - 从 Hub/索引页可顺着链接到达相关 PRD 与 workflow。
- **Module**: `workspace/Hub/`；`src/lib/agent/memory/` write path
- **Priority**: P1

### C3-12 Workspace 混合检索（关键词 + 语义，可选重排）
- **Principle**: 稀疏匹配文件名/术语 + 稠密语义；需要时 rerank。不必自建 ANN 教学实现。
- **Acceptance**:
  - `search_workspace`（或等价）对「退款政策 / Spec 评审 / 某 PRD 标题」可命中正确文件。
  - 返回结构化候选：path、title、snippet、score；支持 top_k / 分页。
  - 大库时检索不阻塞 UI（异步或后台索引）。
- **Module**: `src/lib/agent/tools/`；索引态可在 `workspace/.agent/index/`；书 3-4/3-5/3-6
- **Priority**: P1

### C3-13 结构感知分块 + 上下文前缀（Contextual Retrieval）
- **Principle**: 按 Markdown 标题/段落切分；索引前加「出自哪份文档哪一节」前缀。
- **Acceptance**:
  - 孤立句「收入增长 3%」类片段带文档/章节锚点后可被「某 PRD Q2 指标」查到。
  - 分块元数据含 path、heading、version/updated_at。
- **Module**: `src/lib/agent/tools/` 或 `src/lib/agent/memory/` indexer；书 3-11
- **Priority**: P1

### C3-14 Agentic RAG：检索是工具，不是单次管道
- **Principle**: Agent 多轮 `search → 评估 → 改写 query → 再搜 → 综合`，而非一次 top-k 塞上下文。
- **Acceptance**:
  - 复杂问题（跨多份 PRD/workflow）轨迹中可见 ≥2 次检索工具调用。
  - 简单事实题可一次命中后结束（不强制多轮）。
  - 检索内容带来源标记，且不得单独授权高风险写操作。
- **Module**: `src/lib/agent/tools/`（search_*）；run loop 在 `src/app/api/agent/run/` 或未来 harness；书 3-9/3-10
- **Priority**: P0（工具形态）/ P1（多轮策略成熟度）

### C3-15 双层用户记忆：常驻卡片 + 按需对话细节
- **Principle**: 少量关键事实常驻上下文；海量细节走上下文感知检索（书 3-12 结论）。
- **Acceptance**:
  - 每会话 system/状态栏注入 compact cards（偏好、当前项目、关键人）。
  - 细节问题触发 `search_user_memory` / workspace 检索，而非把全部 history 塞进 prompt。
- **Module**: `src/lib/agent/memory/`；providers/prompt assembly
- **Priority**: P1

### C3-16 知识时效与治理（版本 / 失效）
- **Principle**: 过期文档不得与新版一起误导；检索层过滤失效内容。
- **Acceptance**:
  - 文件或 chunk 带 updated_at / superseded_by；检索默认可排除 marked obsolete。
  - PRD 改版后旧节可标废止，Agent 回答引用新路径。
- **Module**: workspace frontmatter + indexer；`src/lib/agent/tools/`
- **Priority**: P2

### C3-17 RAG 安全：来源标记与间接注入隔离
- **Principle**: 检索文本是数据不是指令；高副作用动作不靠检索内容单独触发。
- **Acceptance**:
  - 注入上下文的外部/文件片段有明确 delimiter（如 `<source path=...>`）。
  - 含「忽略先前指令…」的文档被读入后，仍不能绕过写文件/发外的审批策略。
- **Module**: prompt assembly；`src/lib/agent/tools/` policy；书 Ch.3 安全边界 + Ch.4/5
- **Priority**: P0

---

## Chapter 4 · 工具与异步

### C4-01 五类工具心智模型（在工作台内落地）
- **Principle**: 感知 / 执行 / 协作 / 事件触发 / 用户沟通 分清调用方向与副作用。
- **Acceptance**:
  - 工具注册表每项标注 category + side_effect(read|write|external|none)。
  - UI/日志可按类过滤工具步骤（对齐 `ToolStep.kind` 可扩展）。
- **Module**: `src/lib/agent/tools/`；`src/lib/types.ts`
- **Priority**: P0

### C4-02 七件套感知-执行核心（Coding/FS 最小集）
- **Principle**: read / write / edit / glob / grep / bash(or shell) / code_interpreter 覆盖开放任务；专工具克制增加。
- **Acceptance**:
  - Agent 仅靠上述工具能：在 `workspace/` 找到 PRD、改一段 Markdown、列出 TODO、跑一次本地检查命令（若允许）。
  - 工具数默认 < 15 常驻 schema；其余走 Skills 或 discover。
- **Module**: `src/lib/agent/tools/`；书 Ch.5 七工具 + Ch.4 感知/执行
- **Priority**: P0

### C4-03 Skill + 通用执行器优先于专用 MCP 爆炸
- **Principle**: 参数简单、变更频繁的流程用 Skill 文档 + bash/code；复杂 schema/强安全用专用工具。
- **Acceptance**:
  - `src/lib/agent/skills/`（或 `workspace/**/skills`）以 name+description 目录披露；需要时再 read 全文。
  - PRD 评审流程优先 skill 文档驱动，而非 20 个专用 API 工具。
- **Module**: `src/lib/agent/skills/`；`src/components` skills 面板
- **Priority**: P0

### C4-04 工具描述规范（何时用 / 边界 / 示例）
- **Principle**: 描述决策边界与反例；参数给具体例子；返回值结构写清。
- **Acceptance**:
  - 每个工具 description 含：when_to_use、when_not_to_use、≥1 调用示例。
  - 选错工具的事故优先改描述再换模型（有 debug 清单即可）。
- **Module**: `src/lib/agent/tools/` schemas
- **Priority**: P0

### C4-05 参数传递保真（无静默改写）
- **Principle**: 模型所见世界与工具操作世界一致；禁止静默字符规范化/参数注入。
- **Acceptance**:
  - 中文弯引号、空格、路径在 read→edit 闭环中可 round-trip。
  - 若必须规范化，描述与返回值中显式声明。
- **Module**: `src/lib/agent/tools/` 传输层；`src/app/api/workspace/files/`
- **Priority**: P0

### C4-06 感知工具：分页、offset/limit、显式截断
- **Principle**: 搜索返回候选列表；读文件支持片段；截断可见且可续读。
- **Acceptance**:
  - `read_file(path, offset, limit)` 返回行号前缀与「共 N 行」。
  - 超长输出头尾保留 + 落盘路径提示，禁止静默截断当全文。
- **Module**: `src/lib/agent/tools/`；workspace files API
- **Priority**: P0

### C4-07 执行工具安全分层（校验 → 权限 → 审批）
- **Principle**: 输入校验快速失败；workspace 边界；高风险二次确认/独立审查。
- **Acceptance**:
  - 路径不可逃出 `workspace/`（及明确白名单）。
  - 危险 shell 模式拒绝或升级 HITL。
  - 不可逆写（批量删、覆盖关键 PRD）需确认或 proposer-reviewer。
- **Module**: `src/lib/agent/tools/` policy；`src/lib/cli-runner.ts` 边界
- **Priority**: P0

### C4-08 Sidecar / 轻量门控（结构化工具调用审查）
- **Principle**: 旁路只看 tool name+args，不看主模型话术；与主生成并行门控。
- **Acceptance**:
  - 高风险调用在执行前有 allow/deny/ask_user。
  - 连续拒绝触发熔断 → 交给用户，不无限重试。
- **Module**: `src/lib/agent/tools/` gate；`src/lib/agent/providers/`
- **Priority**: P1

### C4-09 写后自动验证（lint/语法/workflow schema）
- **Principle**: 能自动验证的结果必须自动验证并回注轨迹。
- **Acceptance**:
  - 写 `.md` / `.workflow` / 代码后返回结构化问题列表（若适用）。
  - Agent 在下一轮可据错误自修，无需用户先发现。
- **Module**: `src/lib/agent/tools/` write wrappers；`scripts/verify-deepen.mjs` 可挂接
- **Priority**: P1

### C4-10 长输出截断 + 文件持久化
- **Principle**: 超阈值只回上下文头尾；全文进临时/workspace 文件。
- **Acceptance**:
  - 阈值可配置（字符/行）；返回含 full_path 与如何 read 续读。
- **Module**: `src/lib/agent/tools/`
- **Priority**: P1

### C4-11 幂等与两段式确认（外发/不可逆）
- **Principle**: 可重试操作带 idempotency key；邮件/对外通知预检-确认。
- **Acceptance**:
  - 同一 key 重试不产生双写。
  - 外发类工具默认 dry_run 或 confirm token 第二步。
- **Module**: `src/lib/agent/tools/` external
- **Priority**: P2（本地无外发时可降级）

### C4-12 协作原语：spawn / message / cancel / list
- **Principle**: 子 Agent 生命周期与 HITL 接口标准化。
- **Acceptance**:
  - 可启动专项子任务（如「只审 BDD」），可取消，可查状态。
  - 子 Agent 提示区分 FROM_MAIN / FROM_USER / TOOL_RESULT。
- **Module**: `src/lib/agent/multi/`；书 4-3
- **Priority**: P1

### C4-13 HITL：超时、默认策略、理由回写
- **Principle**: 人工门不阻塞死；批准/拒绝理由进入轨迹供学习。
- **Acceptance**:
  - workflow `humanGate` 阶段：超时行为可配置（保守默认 / 提醒）。
  - 用户确认结果写入 run 轨迹与可选记忆。
- **Module**: `src/components/WorkflowPanel.tsx`；`src/lib/types.ts` Stage；`src/lib/agent/multi/`
- **Priority**: P0（workflow 已有 humanGate 语义）

### C4-14 事件模型：统一入队 + 紧急度策略
- **Principle**: 用户消息、工具结果、定时器、外部 webhook 统一为结构化事件；取消/队列/并行三策略。
- **Acceptance**:
  - 事件含 source、channel、content、context/priority。
  - user.interrupt 可取消当前流；常规补充进队，在安全点批量注入。
- **Module**: 未来 `src/lib/agent/` event loop；API `src/app/api/agent/run/`；书 4-4/4-5
- **Priority**: P1

### C4-15 异步工具：启动/完成解耦 + 占位结果
- **Principle**: 长任务 initiate 即返回 task_id；完成以事件回灌；打断时合法 tool_result 占位。
- **Acceptance**:
  - 长 CLI 运行中用户可再问短问题并得到回复。
  - 轨迹中 tool call 始终有配对 result（真实或 placeholder）。
- **Module**: `src/lib/cli-runner.ts`；agent run harness
- **Priority**: P1

### C4-16 定时 / 心跳 / 工作流触发（本地自动化）
- **Principle**: Cron/Heartbeat/Hook 让 Agent 在无用户消息时仍可检查待办（OpenClaw 类）。
- **Acceptance**:
  - 可配置「每日扫描 workspace 未完成 humanGate 任务」类定时任务。
  - 触发载荷足够，唤醒后少查一轮。
- **Module**: 导航已有 `automation`；`src/lib/agent/` scheduler（待建）
- **Priority**: P2

### C4-17 用户沟通工具（显式 reply / 卡片 / 通知）
- **Principle**: 异步多渠道时「说话」是工具调用，不是裸 assistant 文本。
- **Acceptance**:
  - 至少：session 内 reply + 可选 desktop/notification 钩子。
  - 紧急完成任务可主动召回（本地通知即可）。
- **Module**: `src/components/chat/*`；tools `user_comm`
- **Priority**: P2

### C4-18 MCP 接入策略：互操作 vs 渐进披露
- **Principle**: 可用 MCP 生态，但默认不把全部 schema 灌进上下文；索引名 + 按需加载。
- **Acceptance**:
  - 会话启动工具 token 可控（仅名列表或 discover）。
  - 接入第三方 MCP 前可审计 description；版本可钉死。
- **Module**: `src/lib/agent/tools/` mcp adapter；integrations 面板
- **Priority**: P1

### C4-19 主动工具发现 / Skills 目录检索
- **Principle**: 能力缺口时 search tools 或读 skill 目录，而非一次塞 100+ schema。
- **Acceptance**:
  - `discover_tools` 或等价：自然语言需求 → 3–5 候选 + schema 追加轨迹末尾。
  - 或纯 Skills：grep/read skill 树完成同等任务。
- **Module**: `src/lib/agent/skills/`；`src/lib/agent/tools/`；书 4-6
- **Priority**: P1

### C4-20 MCP/工具信任边界（投毒、遮蔽、凭证）
- **Principle**: description 当不可信输入；同名遮蔽防护；最小权限凭证。
- **Acceptance**:
  - 注册表拒绝重复危险同名或强制 namespace。
  - 密钥只引用 env 路径，不进 prompt。
- **Module**: tools registry；settings
- **Priority**: P1

---

## Chapter 5 · Coding Agent、FS 中枢、Sessionless、恢复

### C5-01 Coding Agent + 文件系统作为架构内核
- **Principle**: 开放任务以少量通用工具 + workspace 为中枢；产物与经验落文件。
- **Acceptance**:
  - 端到端：用户一句话 → Agent 读写 `workspace/` → 可见 PRD/报告文件更新 → 可选更新 MEMORY。
  - 不依赖「只能聊天不能改盘」的只读模式作为默认。
- **Module**: 全局 harness；`workspace/`；`src/lib/agent/tools/`
- **Priority**: P0

### C5-02 Sessionless 友好：状态分文件持久 / 进程按需重建
- **Principle**: 文件系统状态跨消息持久；沙盒/进程可销毁后按清单重建。
- **Acceptance**:
  - 关闭浏览器再开，workspace 文件与 MEMORY 仍在。
  - Agent 工作目录、关键 env 可从 workspace 侧车文件恢复（若使用 shell）。
- **Module**: `workspace/`；`src/app/api/agent/run/`；cli-runner cwd
- **Priority**: P0

### C5-03 项目指令文件注入（AGENTS.md / 工作台约定）
- **Principle**: 每次会话注入稳定项目约定；知识在库内而非口头。
- **Acceptance**:
  - 自动加载仓库/工作台 `AGENTS.md`、`workspace` 级说明。
  - 含构建命令、禁区、workflow 约定；作为稳定前缀利于缓存。
- **Module**: prompt bootstrap；根目录 `AGENTS.md` / `Claude.md`
- **Priority**: P0

### C5-04 Agent 工程化流程（按需裁剪）
- **Principle**: 复杂任务：理解 → 澄清 → 设计文档 → 实现 → 测试/自审 → 文档同步；简单任务可跳级。
- **Acceptance**:
  - 对「新建完整 PRD 流程」类任务，轨迹中出现设计/大纲文件再大改。
  - 完成标准含验证（测试或 checklist），而非「写完即宣称完成」。
- **Module**: skills（prd-workflow）；`src/lib/agent/` policy prompts
- **Priority**: P1

### C5-05 Harness 四件套：验收基线 / 执行边界 / 反馈 / 回退
- **Principle**: 约束优先于提示；验证自动化；反馈快且结构化；Git/备份可回退。
- **Acceptance**:
  - 危险路径/目录黑名单生效。
  - 失败工具返回结构化 error，进入下一轮。
  - 重要写操作可 diff/备份或 git 友好。
- **Module**: tools policy；eval；workspace VCS 约定
- **Priority**: P0

### C5-06 故障分类与恢复（API / 工具 / 上下文 / 控制流）
- **Principle**: 先分类再计数；可重试 vs 不可重试分策；重复指纹检测死循环。
- **Acceptance**:
  - 同一 tool+args 连续失败 N 次熔断并换策略或交用户。
  - 429/网络指数退避；参数错误不盲重试。
  - 全局 max steps / budget。
- **Module**: agent run harness；`src/lib/agent/eval/` 可记指标
- **Priority**: P0

### C5-07 轨迹完整性与空闲看门狗
- **Principle**: tool call 缺 result 自动修补配对；流静默卡死可杀并重试。
- **Acceptance**:
  - 异常中断后恢复会话不因半截 tool 调用崩模型。
  - 长流无输出超时有明确 error 事件。
- **Module**: `src/app/api/agent/run/`；stream client `src/components/chat/*`
- **Priority**: P1

### C5-08 并行工具 + 故障边界
- **Principle**: 独立只读可并行；一批内失败不无条件取消无关调用。
- **Acceptance**:
  - 同时读 3 个 PRD，一个 missing 只报该 path，其余结果仍可用。
- **Module**: tools runtime
- **Priority**: P1

### C5-09 环境状态栏动态注入
- **Principle**: cwd、分支、脏文件、打开文件等动态尾部注入，不写死静态 system。
- **Acceptance**:
  - 每轮推理可见当前 workspace 焦点路径与 git 摘要（若 repo）。
  - 变更不破坏整段静态前缀缓存策略（追加尾部）。
- **Module**: providers/prompt；`src/lib/agent/`
- **Priority**: P1

### C5-10 文件编辑策略：old_string → new_string（默认可靠）
- **Principle**: 精确替换优先；唯一匹配才成功；大段可用首尾匹配演进。
- **Acceptance**:
  - edit 工具：匹配 0/多处时失败并说明；成功返回 diff 摘要。
  - 与 read 行号标注配合，减少错改。
- **Module**: `src/lib/agent/tools/` edit_file
- **Priority**: P0

### C5-11 搜索工具组合：grep + glob（+ 可选语义）
- **Principle**: 本地默认 agentic grep/glob，可不建嵌入；大库再语义。
- **Acceptance**:
  - 按文件名与内容模式定位 workflow/PRD。
  - 支持 glob 过滤与路径排除（如 node_modules）。
- **Module**: `src/lib/agent/tools/`；可复用 ripgrep 若环境允许
- **Priority**: P0

### C5-12 致命三要素 + 持久记忆放大
- **Principle**: 私有数据 + 不可信内容 + 外传能力齐备则高危；记忆写入需同等审查。
- **Acceptance**:
  - 默认：外网/外发关闭或强确认；workspace 私有。
  - 写入 MEMORY 的内容经信任审查（或仅用户批准的 distill）。
  - 威胁模型文档一页写清默认权限。
- **Module**: tools policy；memory write path；`docs/agent-book/`
- **Priority**: P0

### C5-13 沙盒与网络出口（本地档）
- **Principle**: 代码执行默认限制 FS 与网络；白名单按需。
- **Acceptance**:
  - code_interpreter/shell 默认不能读 `~/.ssh` 与 workspace 外。
  - 超时与资源上限返回结构化错误。
- **Module**: `src/lib/agent/tools/` sandbox；cli-runner
- **Priority**: P1

### C5-14 忠诚度：主人指令优先于外部内容
- **Principle**: 工具结果/网页/MCP 文本降级为数据，不可覆盖用户目标。
- **Acceptance**:
  - 系统提示含明确忠诚守则；注入测试：文档内恶意指令不能改写用户「只总结不外发」目标。
- **Module**: system prompt；C3-17 联动
- **Priority**: P1

### C5-15 业务规则代码化（workflow / 评审门禁）
- **Principle**: 自然语言政策 + 工具内服务端真值校验；参数作 checklist，裁决不信模型自报。
- **Acceptance**:
  - 例：workflow 阶段跃迁规则在代码中强制（未过 humanGate 不能标已交付）。
  - 模型 expected_* 与真实状态不一致时拒绝并记录。
- **Module**: workflow engine；`src/lib/types.ts`；tools；书 5-3
- **Priority**: P0（核心 PRD 流程）

### C5-16 代码作为元能力（工作台场景裁剪）
- **Principle**: 用代码做精确计算、生成适配器、动态表单澄清意图；非多媒体工厂。
- **Acceptance**:
  - 需要时 Agent 可跑短脚本处理 CSV/JSON 工作区数据。
  - 信息不全时可生成结构化表单/清单一次补全（对齐动态表单思想，UI 可先 Markdown checklist）。
- **Module**: code_interpreter tool；`src/components` 可选 form；书 5-7/5-9 思想
- **Priority**: P2

### C5-17 提议者-审核者（内容与安全两种用法）
- **Principle**: 生成与审查分离；安全审操作，质量审产物（渲染/规则）。
- **Acceptance**:
  - 高风险执行：第二模型或规则引擎可否决。
  - PRD 大改可选第二 pass 审查清单（结构完整、阶段一致）。
- **Module**: `src/lib/agent/multi/`；`src/lib/agent/eval/`
- **Priority**: P1

### C5-18 可观测性：工具审计日志
- **Principle**: 每次工具调用记时间、参数摘要、结果摘要、耗时，供调试与合规。
- **Acceptance**:
  - 单次对话可导出 tool audit。
  - UI steps 与底层日志一致（`ToolStep`）。
- **Module**: harness logging；`src/components/chat/Message.tsx`
- **Priority**: P1

---

## 建议落地顺序（仅路径，不写代码）

```text
P0 骨架
  C5-01 FS 中枢 + C4-02 七件套 + C4-06/07 读边界与安全
  C3-09 workspace 统一 + C3-01/02/03 记忆分层与提取
  C5-03 指令注入 + C5-05/06 harness 边界与熔断
  C5-10/11 编辑与搜索 + C5-15 workflow 真值门禁
  C3-17 + C5-12 注入与威胁模型
  C4-13 humanGate HITL

P1 增强
  C3-12/13/14/15 检索与 Agentic RAG + 双层记忆
  C4-03/19 Skills 与发现 + C4-08 Sidecar
  C4-14/15 事件与异步工具
  C5-04/09/17 流程、状态栏、双审

P2 规模化
  C3-07/16 压缩与治理 + C4-16/17 自动化与多渠道
  C5-16 元能力扩展 + C4-11 外发幂等
```

---

## 明确不纳入本清单的书中主题

- 参数化记忆 / User as Engram / 多模态感知记忆训练
- 自建 BM25/ANNOY 教学实现、AIME/K&K 数学基准
- 虚拟手机/桌面 Computer Use、电话 Channel（PineClaw）
- PPT/视频流水线、Agent 自举创造 Agent（5-12）作为当前工作台目标
- 异步 RL 训练下一代模型

以上主题可作远期参考，但不阻塞奕枢的工作台 MVP。
