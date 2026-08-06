# Agent 评估怎么跑

本目录用于放置**运行时评估产物**（报告、临时快照等）。
用例定义在代码里：`src/lib/agent/eval/cases.ts`；执行器：`src/lib/agent/eval/runner.ts`。

验收命令与 CI 本地入口：

```bash
cd "/Users/mahaoxuan/Desktop/奕枢/奕枢的工作台"
pnpm test:agent
```

等价于：

```bash
node scripts/verify-agent.mjs
```

---

## 依赖

- 已 `pnpm install`
- 需要 **jiti** 以便脚本直接加载 TypeScript 模块（`verify-agent.mjs` 会提示缺失时安装：`pnpm add -D jiti`）
- 默认只跑 **mock** 用例，不调用真实模型 API

---

## `pnpm test:agent` 检查什么

| 检查 | 含义 |
|------|------|
| agent 模块文件存在 | loop / context / tools / skills / multi / eval / trajectory 等 |
| API route 接线 | `src/app/api/agent/run/route.ts` 使用 `runAgentLoop` / `runMultiAgent` |
| mock 评估套件 | `runAllEvals({ onlyMock: true })`，失败数须为 0 |
| 上下文压缩 | `compressMessages` 保留 system 且缩短轨迹 |
| 内置技能落盘 | `ensureBundledSkills` 写出 `yxt-workflow.md` 等 |
| 工作流读写 | `loadWorkflow` / `saveWorkflow` 可增任务 |

全部通过时终端类似：

```text
PASS  agent modules exist
PASS  api route uses agent runtime
...
ALL PASS N
```

任一项失败：`process.exit(1)`，并打印 `FAIL` 与错误信息。

---

## 用例从哪来

业务向 mock 用例（节选，完整列表以 `cases.ts` 为准）：

| id | 意图 |
|----|------|
| `wf-init-ask-customization` | 读 workflow 后追问四项定制，不瞎建任务 |
| `wf-create-task-after-confirm` | 四项齐全后 `workflow_create_task` |
| `prd-reviewer-reads-before-judge` | 评审员先 `read_file` 再下结论 |
| `human-gate-inbox` | 进入人工门禁时 `inbox_push` |

每条用例可声明：`expectTools`、`expectContains`、`mockScript`（模拟模型 tool_calls / final）。

---

## 工作区副作用

跑评估时 `cwd` 指向仓库下的 `workspace/`。

可能写入或更新：

- `workspace/.agent/workflow-state.json`
- `workspace/.agent/skills/*`（ensure 时）
- `workspace/.agent/inbox.json`（门禁用例）
- `workspace/.agent/memory/*`（若用例触发 memory 工具）

这些是本地状态，可进 `.gitignore` 策略由仓库约定；**不要**把密钥写进 memory。

本 README 所在目录 `workspace/.agent/eval/` 可用来保存你导出的报告文件；当前 runner 默认把结果打印到 stdout，不一定自动写文件。

---

## 只跑评估、不跑静态检查

若已安装依赖且只需 mock 套件，可在 Node 中调用（开发调试用）：

```js
// 概念示例：与 verify-agent.mjs 相同加载方式
const { runAllEvals, formatEvalReport } = load("src/lib/agent/eval/runner.ts");
const report = await runAllEvals({ cwd: "workspace", onlyMock: true });
console.log(formatEvalReport(report.results));
```

日常请优先使用 `pnpm test:agent`，保证与脚本内静态断言一致。

---

## 与其他命令的关系

| 命令 | 范围 |
|------|------|
| `pnpm test:agent` | Agent runtime + mock 业务评估 |
| `pnpm test:deepen` | 流式 Markdown、文件树、Composer 接线等 UI/工具纯检查 |
| `pnpm test` | 先 deepen 再 agent |
| `pnpm build` | Next 生产构建（不含上述 eval） |

---

## 失败时怎么查

1. 看第一条 `FAIL` 的 name 与 stack。
2. 若是 mock 用例：对照 `cases.ts` 的 `expectTools` / `expectContains` 与 `loop` 实际 `toolsUsed`、`finalText`。
3. 若是「jiti not found」：安装 devDependency `jiti` 后重跑。
4. 若是 workflow 状态脏数据干扰：检查 `workspace/.agent/workflow-state.json`，必要时备份后按 `workflow-tools` 默认结构重置（仅本地开发环境）。

活模型（非 mock）评估需要自行传入 `liveProvider`；**默认 CI/本地门禁不依赖外网 Key**。
