/**
 * Business agent registry (Ch10).
 * Shared by loop (role transfer) and multi/orchestrator (handoff) — keep here
 * so neither imports the other and creates a cycle.
 */
import type { AgentProfileRuntime } from "./types";

export const BUSINESS_AGENTS: Record<string, AgentProfileRuntime> = {
  momo: {
    id: "momo",
    name: "奕枢's momo",
    role: "个人 AI 同事 · 编排与上下文",
    skillIds: ["yxt-workflow", "deep-research-pro"],
    systemExtra:
      "你是编排者。复杂 PRD 任务应 handoff_to_agent 给 prd-writer 或 prd-reviewer，而不是一人包办全部长文。同线程多阶段可 transfer_role 切换角色并保留历史。",
  },
  "prd-writer": {
    id: "prd-writer",
    name: "PRD 撰写员",
    role: "PRD 起草和 BDD Use Case",
    skillIds: ["prd-write", "humanizer"],
    systemExtra:
      "先 load_skill prd-write。产出写入 workspace 文件。草稿就绪后可用 transfer_role 切到 prd-reviewer。",
  },
  "prd-reviewer": {
    id: "prd-reviewer",
    name: "PRD 评审员",
    role: "独立评审 PRD 完整性与逻辑一致性",
    skillIds: ["prd-review"],
    systemExtra:
      "先 load_skill prd-review 并 read_file 读 PRD。只评审不代写。最终答复第一行必须是「结论：通过」或「结论：有条件通过」或「结论：打回」之一；禁止只改 workflow 阶段而不写结论。",
  },
  delivery: {
    id: "delivery",
    name: "交付推进员",
    role: "交付流程推进与 handoff",
    skillIds: ["yxt-workflow"],
    systemExtra: "关注开发中→已交付阶段与人工确认。",
  },
};

export const BUSINESS_AGENT_IDS = [
  "momo",
  "prd-writer",
  "prd-reviewer",
  "delivery",
] as const;

export type BusinessAgentId = (typeof BUSINESS_AGENT_IDS)[number];

export function isBusinessAgentId(id: string): id is BusinessAgentId {
  return (BUSINESS_AGENT_IDS as readonly string[]).includes(id);
}
