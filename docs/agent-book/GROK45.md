# 测试 / 运行时默认 LLM：Grok 4.5

依据桌面 **AI组件工作流库** 组件  
`components/cli-proxy-api-subscription-pool/`（本地 OpenAI-compatible 代理池）。

## 接入点

| 项 | 值 |
|----|-----|
| 协议 | OpenAI Chat Completions 兼容 |
| Base URL | `http://127.0.0.1:8317/v1` |
| 鉴权 | `~/.cli-proxy-api/client.env` 的 `OPENAI_API_KEY`（本机代理 key，不是 xAI 官方 secret） |
| 模型 | `grok-4.5` |
| 代理进程 | LaunchAgent `cli-proxy` 监听 `127.0.0.1:8317` |
| xAI 登录态 | `~/.cli-proxy-api/auths/xai-*.json` |

## 本仓库行为

- `src/lib/agent/load-env.ts` 自动加载：
  1. `~/.cli-proxy-api/client.env`
  2. `~/.config/ai-providers/env.local`（MiniMax / Stepfun 等 fallback）
- `resolveAutoProvider()` 默认 **`YXT_LLM_PREFER=grok`**，模型 **`grok-4.5`**
- 失败（402/429/5xx）时 failover → MiniMax → Stepfun → Volc

## 手动冒烟

```bash
# 代理必须在听
lsof -nP -iTCP:8317 -sTCP:LISTEN

# 客户端 env
set -a; source ~/.cli-proxy-api/client.env; set +a

# 裸 chat
curl -sS -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  "$OPENAI_BASE_URL/chat/completions" \
  -d '{"model":"grok-4.5","messages":[{"role":"user","content":"Reply GROK45_OK"}],"max_tokens":16}'

# 工作台 Agent
cd "/Users/mahaoxuan/Desktop/奕枢/奕枢的工作台"
pnpm smoke:agent
```

## 对照实验

```bash
YXT_LLM_PREFER=minimax pnpm smoke:agent
```

## 不要做的事

- 不要把 `OPENAI_API_KEY`（本机代理）当成 xAI 官方 Key 写进仓库
- 不要把 8317 绑到 `0.0.0.0` 公网暴露
