# Lessons from runs

> Auto-harvested offline from workspace trajectories (Ch8).
> Do not treat single failures as formal policy - look for repeated patterns.

## Aggregate

- Total runs: 526
- Success rate: 99.6%
- Failures: 2

## Top tools

- `read_file` × 140
- `load_skill` × 113
- `handoff_to_agent` × 69
- `workflow_move_task` × 66
- `list_workspace` × 39
- `workflow_create_task` × 36
- `write_file` × 35
- `memory_write` × 34
- `memory_search` × 34
- `inbox_push` × 34

## Recurring process gaps

- **no_perception_tools** (seen 1× on failed runs)

## Failure cases (recent)

- `tr-1786029781270-26ls5` agent=momo: LLM stepfun HTTP 402: {"error":{"message":"You exceeded your current quota, please check your plan and billing details","type":"quota_exceeded"}}
  - prompt: 只用 list_workspace 列出根目录，一句话总结
- `tr-1786028585599-hx4fl` agent=momo: LLM stepfun HTTP 402: {"error":{"message":"You exceeded your current quota, please check your plan and billing details","type":"quota_exceeded"}}
  - prompt: 只用 list_workspace 工具列出 workspace 根目录文件，然后用一句话总结。

## Recommended procedures

- Long or doc-related tasks: call `search_workspace` / `read_file` before answering from memory.
- Avoid answering long prompts with zero perception tools (hallucination risk).

## Raw harvest draft

# Auto-harvested lessons

- run tr-1786028585599-hx4fl: LLM stepfun HTTP 402: {"error":{"message":"You exceeded your current quota, please check your plan and billing details","type":"quota_exceeded"}} | prompt=只用 list_workspace 工具列出 workspace 根目录文件，然后用一句话总结。
- run tr-1786029781270-26ls5: LLM stepfun HTTP 402: {"error":{"message":"You exceeded your current quota, please check your plan and billing details","type":"quota_exceeded"}} | prompt=只用 list_workspace 列出根目录，一句话总结

## Source trajectory ids

- tr-1786029781270-26ls5
- tr-1786028585599-hx4fl
