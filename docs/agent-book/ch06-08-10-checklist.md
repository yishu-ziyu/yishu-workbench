# Ch6 / Ch8 / Ch10 可落地需求清单

来源：`ai-agent-book` 第 6、8、10 章。  
目标产品：奕枢工作台 Agent 层（`src/lib/agent/`）。  
原则：只列**可实现、可验收**项；不写代码。

**业务角色映射（seed 已定）**

| seed id | 产品角色 | 本书拓扑中的位置 |
|---------|----------|------------------|
| `momo` | 编排与上下文 | Orchestrator / triage / Manager |
| `prd-writer` | PRD 起草 + BDD | Peer Proposer / 顺序流水线 Writer |
| `prd-reviewer` | 独立评审 | Peer Reviewer（必须引入新信息） |
| `delivery` | 交付推进 / handoff | 下游 Handoff 接收方 / 阶段推进 Worker |

工作流锚点：`PRD - Spec 评审`（draft → ai-review → pm-review → bdd → owner → dev → shipped…）。

**第 7 章后训练（deferred）**  
参数更新 / 仿真训练环境 / GRPO 等后训练不在本清单实现范围：生产轨迹尚不足以支撑安全在线调参，且当前缺口在 Harness 评估与多角色编排，不在权重。

---

## 优先级约定

| 级 | 含义 |
|----|------|
| P0 | 没有就不能安全跑通 PRD 多角色主路径 |
| P1 | 主路径可用后立刻补，决定可信度与可迭代性 |
| P2 | 增强项；规模或成本上来后再做 |

---

## Ch6 · 评估环境、数据集、Judge、可观测、持续迭代

### E6-01 可重置评估环境骨架
- **name**: Resettable eval environment
- **principle**: 评估对象是「模型 + Harness」组合；环境状态可重置到同一初始条件，工具为原子操作，协议有明确终止条件。
- **acceptance**:
  - 同一用例连续跑 2 次，初始环境状态一致（可对比 hash / 快照）。
  - 至少支持「工具调用型」协议：多轮 tool → 最终状态检查。
  - 失败时工具返回可读错误，而非仅布尔 fail。
- **module**: `src/lib/agent/eval/environment.ts`
- **priority**: P0

### E6-02 人机交互评估：用户模拟 + 渐进透露
- **name**: Progressive user simulation
- **principle**: 人机任务不得在首轮暴露全部事实；模拟用户按脚本渐进透露，且不得编造脚本外信息。
- **acceptance**:
  - 每个对话型用例有 `known_facts` 与 `disclosure_script` 分离字段。
  - Agent 首轮上下文中不包含未透露事实。
  - 模拟用户违反「不编造」时可检测并 fail 用例本身。
- **module**: `src/lib/agent/eval/user-sim.ts`
- **priority**: P1

### E6-03 PRD 领域评估数据集
- **name**: PRD domain eval dataset
- **principle**: 任务明确可复现、验证客观可执行；覆盖典型 / 边界 / 陷阱；防泄漏（参数化实例，勿死记模板答案）。
- **acceptance**:
  - 至少 3 档难度（澄清不足 / 完整起草 / 跨文档一致性）。
  - 每条用例含：初始输入、成功条件（文件/字段级）、可选陷阱（虚假「已批准」、范围外需求）。
  - 参数化字段（产品名、指标、日期）可实例化，避免固定串记忆。
  - 与训练/提示示例集目录隔离。
- **module**: `src/lib/agent/eval/datasets/prd/`
- **priority**: P0

### E6-04 指标词典：过程 + 结果 + 安全否决
- **name**: Metrics dictionary
- **principle**: 同时看轨迹与结果；安全/幻觉为零容忍否决；稳定性用 Pass^k，能力上限用 Pass@k。
- **acceptance**:
  - 产出结构化报告：任务成功、工具合法率、步数/冗余、token/延迟、安全否决。
  - 支持 Pass@1、Pass@k、Pass^k 计算与文档化适用场景。
  - 任一安全否决维度 fail → 总分 0（不可被高表达分抵消）。
- **module**: `src/lib/agent/eval/metrics.ts`
- **priority**: P0

### E6-05 双覆盖验证（轨迹 vs 结果）
- **name**: Trajectory and outcome dual check
- **principle**: 「说已完成」≠ 环境已变更；只看轨迹会漏假完成，只看结果会漏歪路径。
- **acceptance**:
  - 对 PRD 流程：结果检查 = 目标文件/字段存在且满足 schema；轨迹检查 = 必经工具/阶段信号出现。
  - 构造「口头完成但未写文件」用例时必须判 fail。
  - 构造「文件正确但跳过评审门」用例时过程维度 fail。
- **module**: `src/lib/agent/eval/verifiers/dual.ts`
- **priority**: P0

### E6-06 Rubric 驱动的 LLM-as-Judge
- **name**: Rubric LLM-as-judge
- **principle**: Rubric 四准则：专家标准、全面+陷阱、权重/否决、自包含可验证档位；禁止模糊「深刻理解」式条目。
- **acceptance**:
  - PRD 评审至少维度：问题定义、范围/non-goals、验收标准、逻辑一致、幻觉/无依据断言（veto）。
  - 每维输出 `score | pass/fail/uncertain` + 证据引用（轨迹轮次或文件片段）+ 置信度。
  - 长度偏差缓解：Rubric 惩罚堆砌；可选长度归一后复评。
- **module**: `src/lib/agent/eval/judge/rubric.ts`
- **priority**: P0

### E6-07 Judge 校准与多源策略
- **name**: Judge calibration
- **principle**: Judge 是代理人类，须金标校准；同源偏见用异构模型审计。
- **acceptance**:
  - 金标集 ≥ 30 条（可先小后扩），记录与人类一致率 / kappa 目标门槛。
  - Rubric 或 judge 模型变更后强制重跑校准。
  - 生产默认可单 judge；P1 审计路径支持第二模型或人工队列。
- **module**: `src/lib/agent/eval/judge/calibration.ts`
- **priority**: P1

### E6-08 可观测性：Trace / Span
- **name**: Agent observability traces
- **principle**: 一次任务一条 trace；LLM/工具/检索为 span；异步采集不阻塞主路径；标准语义便于换后端。
- **acceptance**:
  - 每次 `/api/agent/run`（或等价入口）生成 `trace_id`，含父子 span、token、耗时、错误。
  - 可按 conversation / workflow task 回放完整轨迹。
  - 脱敏钩子：密钥/用户隐私字段可剥离后再落盘。
- **module**: `src/lib/agent/eval/observe/trace.ts`（采集也可挂 `providers/` 调用边界）
- **priority**: P0

### E6-09 生产失败回流评估集
- **name**: Prod-to-eval promotion
- **principle**: 可观测 → 脱敏失败案 → 回归用例；评估集随真实分布生长。
- **acceptance**:
  - 从失败/可疑 trace 一键（或 CLI）生成候选用例草稿。
  - 脱敏检查清单通过后才进入 `eval/datasets/`。
  - 晋升用例带来源 `trace_id` 与日期。
- **module**: `src/lib/agent/eval/promote.ts`
- **priority**: P1

### E6-10 统计显著性门槛
- **name**: Significance gate
- **principle**: 分差小于噪声带宽不做切换；同批任务用配对比较；防多重比较假阳性。
- **acceptance**:
  - 对比报告输出 n、p、标准误近似、是否建议切换。
  - 默认同一 eval set 配对；单次运行不得作为发布依据（配置 3+ seed 或注明）。
  - 并行试多个假设时标记「需独立复现」。
- **module**: `src/lib/agent/eval/stats.ts`
- **priority**: P1

### E6-11 单变量持续迭代实验记录
- **name**: Single-variable iteration log
- **principle**: 每轮只改一个假设；先查评测系统再怪 Agent；报告写清适用范围与下一步。
- **acceptance**:
  - 实验记录含：假设、唯一变更、固定因素、结果（成功/成本/回归）、结论边界。
  - 「分数下降」流程强制勾选：环境/评分器自检完成。
- **module**: `src/lib/agent/eval/experiment-log.ts`
- **priority**: P2

### E6-12 提示词确定性渲染与版本回归
- **name**: Prompt snapshot regression
- **principle**: 系统提示是代码；相同配置必须渲染相同；变更走评估回归。
- **acceptance**:
  - 给定 agentId + 配置 → 渲染全文可哈希对比。
  - 变更产生版本快照；CI/脚本可对核心 eval 子集跑回归。
- **module**: `src/lib/agent/skills/prompt-render.ts` + `src/lib/agent/eval/prompt-regression.ts`
- **priority**: P1

### E6-13 成本与预算护栏
- **name**: Cost and budget guardrails
- **principle**: 成本含上下文累积与工具回灌 token；任务级上限防循环烧钱。
- **acceptance**:
  - 按任务汇总 input/output/cache token 与估算费用。
  - 超预算终止并写 trace 原因。
  - 报告区分「模型调用 vs 工具回灌」占比（可抽样）。
- **module**: `src/lib/agent/eval/cost.ts`
- **priority**: P1

### E6-14 消融开关（特性真实贡献）
- **name**: Ablation feature flags
- **principle**: 主特性可独立关闭，验证是否真改善体验。
- **acceptance**:
  - 至少 memory / 压缩 / 多角色评审 可关；关闭后仍能跑单 agent 基线。
  - 消融结果进入 eval 报告维度。
- **module**: `src/lib/agent/eval/ablation.ts` + 运行时 flags 配置
- **priority**: P2

---

## Ch8 · 轨迹学习信号、知识/Prompt/Skill/Harness 更新、验证与回滚

### E8-01 三层轨迹验证器
- **name**: Three-layer trajectory verifier
- **principle**: 底层结果（环境真值）→ 中层过程（规则/权限/序列）→ 上层质量（Rubric）；越靠下越不交给 LLM 猜。
- **acceptance**:
  - 输出结构化诊断：各维 pass/fail/uncertain + 证据 + 置信度，**禁止**仅标量总分。
  - 高总分不得掩盖规则/隐私/幻觉失败。
  - 低置信度与高风险进人工或第二验证器队列。
- **module**: `src/lib/agent/eval/verifiers/trajectory.ts`
- **priority**: P0

### E8-02 学习信号与诊断分离
- **name**: Signal vs evolution separation
- **principle**: 验证器只评价；改哪里由独立诊断/进化模块决定；禁止同一调用既当裁判又直接改生产规则。
- **acceptance**:
  - API 边界：`verify(trajectory)` 与 `propose_update(diagnosis)` 分离模块/权限。
  - 未经验证的反馈不得写入正式知识/Prompt。
- **module**: `src/lib/agent/eval/verifiers/*` + `src/lib/agent/memory/evolve/`（或 `skills/evolve/`）
- **priority**: P0

### E8-03 不可变轨迹 + 单次分析 + 跨轨迹归纳
- **name**: Evidence layers for learning
- **principle**: 原始轨迹不可变审计；单次分析出候选教训；多条同类轨迹才升正式知识。
- **acceptance**:
  - 三层存储：raw trajectory / run analysis / formal knowledge doc。
  - 正式结论须列来源轨迹 ID；单次偶然成功不得升正式。
  - 推荐策略至少跨 ≥2 条非失败轨迹支持（可配置门槛）。
- **module**: `src/lib/agent/memory/experience/`
- **priority**: P1

### E8-04 经验知识文档 schema
- **name**: Experience knowledge document
- **principle**: 写「何条件下如何行动」：适用场景、推荐策略、禁止做法、例外、证据、最近验证时间。
- **acceptance**:
  - Markdown/结构化字段齐全；检索只拉文档不拉全量原始轨迹。
  - 环境/政策版本变化可撤销单条结论并保留审计。
- **module**: `src/lib/agent/memory/experience/schema.ts`
- **priority**: P1

### E8-05 Prompt 最小 diff 学习
- **name**: System prompt min-diff learning
- **principle**: 可语言化且反复出现的策略错误 → 最小 `old→new` 补丁；注明作用域；边界集改善且保留集不退化。
- **acceptance**:
  - 候选 manifest：来源 case、理由、diff、作用域。
  - 门槛：非空补丁、可追溯、边界改善、保留集无回归 → 仅 `release_to_canary`，不直写稳定版。
  - 任一项失败 → `reject_candidate` 并保留原因。
- **module**: `src/lib/agent/skills/prompt-evolve.ts`
- **priority**: P1

### E8-06 Skill 生成/补丁生命周期
- **name**: Skill patch lifecycle
- **principle**: 局部流程写成按需 Skill；先搜库再 patch，避免重复手册；含何时加载、前置、步骤、陷阱、验证、来源。
- **acceptance**:
  - 候选 Skill 必经领域任务 + 旧任务回归。
  - 近似能力优先 patch 既有目录。
  - 激活率与遵循率可观测（见 E8-09）。
- **module**: `src/lib/agent/skills/lifecycle.ts`
- **priority**: P1

### E8-07 Harness/程序候选与发布契约
- **name**: Harness candidate release contract
- **principle**: 稳定流程与硬约束编译进程序；候选分支 + 变更契约（证据、根因、组件、预期修复、可能受损、用例）；验证器与门槛不可被业务 Agent 改。
- **acceptance**:
  - 候选只写隔离目录；通过静态检查/重放失败轨迹/回归后才 canary。
  - `release_manifest` 含回滚版本指针。
  - 业务路径无法修改 verifier、审计日志、发布门槛代码路径。
- **module**: `src/lib/agent/tools/harness-evolve.ts`（门槛配置只读挂 `eval/`）
- **priority**: P2

### E8-08 在线执行 / 离线进化双循环
- **name**: Online offline dual loop
- **principle**: 在线只完成任务并记证据；离线聚合、诊断、候选、验证、发布。
- **acceptance**:
  - 在线路径无自动覆盖正式 Prompt/Skill/知识。
  - 离线任务可被时间/错误频率/轨迹数量触发。
  - 两循环通过版本化经验库与评估集连接。
- **module**: `src/lib/agent/memory/evolve/loop.ts`
- **priority**: P1

### E8-09 分层进化指标
- **name**: Evolution metrics split
- **principle**: 区分「更新器是否提出好修改」与「任务 Agent 是否激活并遵循」；勿只看端到端总分。
- **acceptance**:
  - 报告：候选有效率、产物激活率、遵循成功率、留出任务增益、负迁移、回归。
  - 支持固定 Harness 换任务模型 / 固定任务模型换更新器 的对照钩子（可先手动）。
- **module**: `src/lib/agent/eval/metrics-evolution.ts`
- **priority**: P2

### E8-10 灰度、回滚与安全边界
- **name**: Canary rollback safety
- **principle**: 证据与指令隔离；候选与正式隔离；安全机制不可自我修改；提示注入不得固化为经验。
- **acceptance**:
  - 正式能力区与候选区路径分离。
  - 关键指标恶化自动/一键回滚到已知版本。
  - 原始网页/工具输出入知识前须总结+审核门（非直接写入 Skill）。
- **module**: `src/lib/agent/memory/evolve/release.ts`
- **priority**: P1

### E8-11 睡眠学习整理周期
- **name**: Sleep learning curator
- **principle**: 采集与整理分开；合并重复、解决冲突、修剪过期、保留来源与快照。
- **acceptance**:
  - 周期步骤可跑：触发 → 定向 → 整合 → 验证 → 修剪/索引。
  - 长期未用或被推翻的能力可归档且可回滚。
  - 全局 Prompt 不无限膨胀：局部规则下沉到 Skill。
- **module**: `src/lib/agent/memory/evolve/curator.ts`
- **priority**: P2

### E8-12 根因路由：改知识 / Prompt / Skill / 代码
- **name**: Root-cause update router
- **principle**: 表面问题可能对应不同载体；选最小、最易验证回滚的修改；证据不足先攒样本。
- **acceptance**:
  - 诊断输出建议载体 + 理由；偶发单例默认 `accumulate`。
  - 虚假承诺类：可路由到 Prompt 或「回复-工具状态一致性」Harness 检查。
- **module**: `src/lib/agent/memory/evolve/router.ts`
- **priority**: P1

---

## Ch10 · 多 Agent：上下文、拓扑、Handoff、失败模式  
（显式映射 seed 角色）

### M10-01 上下文共享策略决策
- **name**: Shared vs isolated context policy
- **principle**: 共享 = 信息零损耗、易膨胀；隔离 = 显式通信、可并行。累计上下文将超窗口约 50% 则隔离；正确性硬依赖零损耗则共享。
- **acceptance**:
  - 运行时可配置：`shared_stage_chain` | `isolated_handoff` | `hybrid`。
  - Hybrid：draft 澄清可共享；ai-review 起默认隔离 + 移交包。
  - 策略选择写入 trace。
- **module**: `src/lib/agent/multi/context-policy.ts`
- **priority**: P0

### M10-02 角色注册表对齐 seed
- **name**: Role registry from seed agents
- **principle**: 静态前缀（系统提示 + 工具集）定义身份；与 `seed` 四角色一一对应，可独立打磨。
- **acceptance**:
  - `momo` / `prd-writer` / `prd-reviewer` / `delivery` 各有独立 prompt 与 tool allowlist。
  - 切换角色必换工具集（评审员默认无「直接定稿覆盖」类写权限，或写权限限于评审报告路径）。
  - 注册表可被 `momo` 查询（list agents）。
- **module**: `src/lib/agent/multi/roles.ts`
- **priority**: P0

### M10-03 momo 作为 Orchestrator
- **name**: momo orchestrator
- **principle**: Manager 负责任务分解、调度、进度、异常、整合；最强模型/提示预算优先给规划者；子 Agent 返回结构化摘要而非全量轨迹。
- **acceptance**:
  - momo 可 `spawn`/`assign` writer、reviewer、delivery，并维护任务状态机。
  - 子 Agent 回传：结论、关键发现、产物路径、问题列表；全量轨迹仅落子日志。
  - momo 上下文不因章节级正文膨胀（只持文件索引 + 状态）。
  - 子任务带 step/token 预算；超时可取消。
- **module**: `src/lib/agent/multi/orchestrator.ts`
- **priority**: P0

### M10-04 prd-writer ↔ prd-reviewer 对等循环
- **name**: Writer-reviewer peer loop
- **principle**: 多 Agent 价值来自**新信息**；纯自我复读无效。Reviewer 必须用独立 Rubric/检查表/工具结果，而非同一模型再读一遍正文。
- **acceptance**:
  - 循环：writer 产出 PRD 路径 → reviewer 出结构化问题清单（引用章节）→ writer 修订 → 直到通过或达轮次上限。
  - Reviewer 输入含：产物路径 + Rubric +（可选）仓库/政策文件；**默认不**含 writer 思维链全文。
  - 过早终止防护：无验证器通过不得标 stage 完成。
  - 最大轮次与 token 预算可配；防死循环。
- **module**: `src/lib/agent/multi/peer-loop.ts`
- **priority**: P0

### M10-05 工作流阶段角色转换（共享上下文形态）
- **name**: Stage-based role switch
- **principle**: 预定义阶段切换 system prompt + tools；轨迹可继承；阶段门控不可跳过。
- **acceptance**:
  - 映射：draft→`prd-writer`；ai-review→`prd-reviewer`；bdd→`prd-writer`；dev/ship 协调→`delivery`；全程编排→`momo`。
  - 阶段完成仅能通过显式工具/信号（如 `submit_for_review`），与 workflow stageId 同步。
  - 评审 fail 可回退 draft/bdd，且保留历史。
- **module**: `src/lib/agent/multi/stage-switch.ts`
- **priority**: P0

### M10-06 隔离上下文 Handoff 包
- **name**: Isolated handoff package
- **principle**: 移交三件套：任务描述+验收、已确认事实与约束、结构化产物引用（路径）；不传全量试错轨迹。
- **acceptance**:
  - Handoff schema 校验必填字段；缺验收标准则拒绝移交。
  - 接收方仅加载包 + 按需读路径；token 对比「塞全文」有上限策略。
  - 移交次数上限防成环（A→B→A）。
- **module**: `src/lib/agent/multi/handoff.ts`
- **priority**: P0

### M10-07 delivery 下游 Handoff
- **name**: Delivery handoff
- **principle**: 交付推进员接收已过门的产物与约束，推进开发同步与收尾，不重写 PRD 事实源。
- **acceptance**:
  - 仅在 pm-review/owner 等人闸通过后可被 momo 派发（可配置）。
  - 输入 handoff 含：PRD 路径、BDD 路径、open issues、验收标准。
  - 输出：状态更新、风险、下一步人类动作；不静默改 PRD 正文事实。
- **module**: `src/lib/agent/multi/roles/delivery.ts`（逻辑可在 `handoff` + orchestrator）
- **priority**: P1

### M10-08 虚拟文件系统四区
- **name**: Virtual FS regions
- **principle**: scratchpad 私有；shared 用户可见协作；external 挂载受权；skills 只读内置。默认隔离，共享显式。
- **acceptance**:
  - 路径约定文档化并实现边界检查（子 Agent 不可读他人 scratch）。
  - 角色间产物交换以 shared 路径字符串为主。
  - skills 全局只读。
- **module**: `src/lib/agent/multi/fs-layout.ts` + `src/lib/agent/tools/fs.ts`
- **priority**: P0

### M10-09 控制平面：消息信封与状态
- **name**: Control plane messaging
- **principle**: 消息带信封（from/to/type/payload）；状态机词汇统一（running/needs_input/done/failed）；进度可读 progress 文件或消息，避免无脑轮询。
- **acceptance**:
  - 支持类型：`task_assigned` / `status_update` / `result` / `terminate`。
  - momo 可 list 活跃子任务状态；progress 超时触发卡住检测。
  - 优雅终止：子循环检查 cancel；父取消级联子。
- **module**: `src/lib/agent/multi/bus.ts`
- **priority**: P1

### M10-10 并行协调与级联终止
- **name**: Parallel spawn and cascade cancel
- **principle**: 独立上下文可并行；一者成功可终止其余；用锁/幂等防双重结算竞态。
- **acceptance**:
  - momo 可并行派多 worker（如同类调研子任务）；并发上限可配。
  - 首次 `target_found`/`result` 锁定后忽略重复成功结算。
  - 终止后无悬挂 orphan（级联 cancel）。
- **module**: `src/lib/agent/multi/parallel.ts`
- **priority**: P2

### M10-11 失败模式：共享写冲突
- **name**: Shared write conflict control
- **principle**: 文件级乐观锁或 worktree 隔离；跨文件语义冲突靠编排避免并行写依赖文件。
- **acceptance**:
  - shared 区写入带 version/etag；冲突时强制重读再写。
  - writer 与 reviewer 同时写同一 PRD 路径时不丢更新（冲突显式可见）。
  - 文档说明：依赖文件禁止无协调并行改。
- **module**: `src/lib/agent/multi/fs-locking.ts`
- **priority**: P1

### M10-12 失败模式：错误级联放大
- **name**: Cascade error dampening
- **principle**: Agent 间传语义有损；错误会因「一致性」被放大；用独立视角交叉验证 + 确定性检查断链。
- **acceptance**:
  - reviewer 默认不看 writer 思维链，只看产物+证据（独立视角）。
  - 高风险结论（范围、合规、数字指标）须确定性或第二源校验钩子。
  - 负例：错误术语/错误前提被下游「一致沿用」时，评审维应 fail。
- **module**: `src/lib/agent/multi/cross-check.ts`
- **priority**: P1

### M10-13 MAST 对齐的完成判定
- **name**: Completion verification gate
- **principle**: 任务验证缺失是多 Agent 主因失败类；「声称完成」必须过验证器。
- **acceptance**:
  - stage 迁移 API 调用完成验证器；失败则停留并写诊断。
  - 覆盖：接口不清/职责重叠配置可在启动时 lint（角色 tool 冲突告警）。
- **module**: `src/lib/agent/multi/completion-gate.ts`
- **priority**: P0

### M10-14 多 Agent 才启用的判据
- **name**: Multi-agent worth gate
- **principle**: 仅当协作引入生成时不存在的新信息（执行/工具/独立检查表）才拆多角色；否则单 momo/writer 更省。
- **acceptance**:
  - 配置项：简单改写任务可强制单 agent。
  - 成本报告：多 agent 路径 token 倍数相对单 agent 基线可测。
  - 文档写明：辩论式互喷同一文本默认不作为 PRD 质量手段。
- **module**: `src/lib/agent/multi/worth.ts`
- **priority**: P2

### M10-15 跨角色可观测
- **name**: Multi-agent trace stitching
- **principle**: 跨 Agent 执行流比微服务更语义化；须能拼出完整协作时间线。
- **acceptance**:
  - 父 `trace_id` + 子 `span_id`；handoff 事件可检索。
  - 调试视图：momo 决策 → writer 产物 → reviewer 结论 → delivery 状态。
- **module**: `src/lib/agent/eval/observe/multi-trace.ts`
- **priority**: P1

---

## 建议落地顺序（只排队列，不写实现）

```text
P0 纵切（PRD 主路径可信）
  E6-01,03,04,05,06,08
  E8-01,02
  M10-01,02,03,04,05,06,08,13

P1 可迭代与防翻车
  E6-02,07,09,10,12,13
  E8-03,04,05,06,08,10,12
  M10-07,09,11,12,15

P2 规模与精致度
  E6-11,14
  E8-07,09,11
  M10-10,14
```

**最小可演示故事（验收故事）**

1. 用户向 **momo** 提需求 → 派 **prd-writer** 写 PRD 到 shared 路径。  
2. **prd-reviewer** 用 Rubric + 双覆盖验证出结构化问题（新信息），不共享 writer 思维链。  
3. 循环至通过或达上限 → 人闸 pm-review。  
4. 通过后 handoff **delivery**；全程 trace 可回放；失败轨迹可进 eval 集。  
5. 离线：三层验证器产诊断 → 仅候选区更新 Prompt/Skill/经验文档 → 回归后 canary。

---

## 模块目录总览（相对 `src/lib/agent/`）

| 目录 | 本清单主要职责 |
|------|----------------|
| `eval/` | 环境、数据集、指标、Judge、trace、成本、统计、进化指标 |
| `memory/` | 经验知识层、进化双循环、curator、release |
| `skills/` | Prompt 渲染/最小 diff、Skill 生命周期 |
| `tools/` | FS 工具、Harness 候选（若动程序） |
| `multi/` | 角色、编排、peer 循环、handoff、总线、锁、完成门 |
| `providers/` | 模型调用边界埋点（span 注入点，无单独需求条） |

---

## 非目标（本清单明确不做）

- 第七章：SFT / RL / 仿真百万交互训练场（见文首 deferred）。
- 完整 A2A 跨组织协议（内部 bus 足够；A2A 待外部协作出现）。
- Agent 社会模拟、经济涌现等研究向能力。
- 浏览器 RPA 工作流编译（Ch8 实验级，非 PRD 工作台 P0）。
