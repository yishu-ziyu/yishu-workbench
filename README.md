# 奕枢的工作台

Web-first agent workspace shell（对齐 Moxt 产品面：对话 / 工作空间 / AI 同事 / 工作流看板 / 技能 / 自动化 / 集成 / 资源广场）。

内部代号曾用 `yxt`；仓库与本地目录现统一为 **奕枢的工作台**。

## 产品差异（相对 Moxt）

| Moxt | 本仓库 |
|------|--------|
| 云端模型 + Credits | **本机 CLI Agent**（`claude` / `codex` / 自定义 / echo 回环） |

## 本地运行

```bash
cd "/Users/mahaoxuan/Desktop/奕枢/奕枢的工作台"
pnpm install
pnpm dev --port 3456
```

打开 http://localhost:3456

## 验证

```bash
pnpm test:deepen
pnpm build
curl -s http://localhost:3456/api/cli/list
```

## 结构摘要

- `src/components/chat/` — Thread / Message / Composer / ThreadList
- `src/lib/markdown.tsx` + `streamdown` — 流式 Markdown
- `src/components/workspace/FileTree.tsx` — 工作空间文件树
- `src/lib/cli-runner.ts` — 本地 CLI spawn（当前为 `claude -p` 单轮 print 模式）
