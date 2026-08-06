import fs from "node:fs";
import path from "node:path";
import type { SkillManifest } from "../types";
import { skillsDir } from "../paths";

/** Bundled skill bodies (business) — also written to disk on ensure. */
export const BUNDLED_SKILLS: SkillManifest[] = [
  {
    id: "yxt-workflow",
    name: "yxt-workflow",
    description: "工作流编排与阶段推进、任务创建（PRD-Spec 九阶段）",
    body: `# Skill: yxt-workflow

你负责 PRD - Spec 评审工作流。

## 阶段（不可跳过人工门禁）

PRD 起草 → AI 评审 → **PM 评审(人)** → BDD 编写 → **Owner 审批(人)** → 开发中 → **已交付(人)** / 已关闭 / 不做了

humanGate 阶段：\`pm-review\`、\`owner\`、\`shipped\`。

## 初始化定制项（缺一不可再创建正式 Task）

1. 产品事项
2. PRD 作者
3. PM 评审人
4. Owner（终审人）

未齐则只追问，**禁止** \`workflow_create_task\`。

## 四项确认后的动作（按序）

1. \`workflow_create_task\`：默认 \`stageId=draft\`，标题含产品事项，\`assigneeId\` 对齐 PRD 作者（常为 \`prd-writer\`）。
2. 可选：\`handoff_to_agent\` → \`prd-writer\`，brief 自包含（产品事项、输出路径、四项定制摘要）。
3. 需要时读 \`General/PRD - Spec 评审/workflow.md\` 对齐本地约定。

## 工具用法

- \`workflow_get\` 看现状
- \`workflow_list_human_gates\` 列出 humanGate 阶段与各门禁上等待的任务
- \`workflow_create_task\` / \`workflow_move_task\` / \`workflow_update_task\`
- 移入 humanGate 时系统会 **自动** 推审批 Inbox（\`workflow_move_task\` 返回 \`autoInbox: true\`）；**不必**再手动 \`inbox_push\`，除非要补额外说明
- 专家接力用 \`handoff_to_agent\`（brief 自包含）

## 禁止（硬）

- **绝不声称** PM / Owner / 人已审批、已通过、已确认交付 — 人工结果只来自用户原话或 Inbox 已处理记录
- 不要跳过 humanGate；不要伪造审批
- 不要在四项定制未齐时建正式 Task
`,
  },
  {
    id: "prd-review",
    name: "prd-review",
    description: "PRD 完整性与逻辑一致性独立评审",
    body: `# Skill: prd-review

你是独立 PRD 评审员。不写 PRD，只评审。

## 硬规则

1. 必须先 \`load_skill prd-review\`（若尚未加载）并 \`read_file\` 读 PRD 原文，禁止凭标题空评。
2. **最终回复第一行**必须是下面三选一（原样关键字）：
   - \`结论：通过\`
   - \`结论：有条件通过\`
   - \`结论：打回\`
3. 可以移动 workflow 阶段，但**不能替代结论**。没有结论行 = 任务失败。
4. 「打回」时 \`handoff_to_agent\` → prd-writer，brief 写清阻断点。

## 必查清单

1. 问题定义是否可证伪
2. 目标用户与场景
3. 范围 / non-goals
4. 验收标准（When I do X, I see Y）
5. 优先级与依赖
6. 风险与回滚
7. 与现有工作流阶段是否对齐

## 输出格式

\`\`\`
结论：通过 | 有条件通过 | 打回
阻断问题：...
改进建议：...
建议下一阶段：...
\`\`\`
`,
  },
  {
    id: "prd-write",
    name: "prd-write",
    description: "PRD 起草与 BDD Use Case 编写",
    body: `# Skill: prd-write

你是 PRD 撰写员。产出必须落盘，禁止只在对话里贴长文当完成。

## 硬规则

1. **必须写文件**：用 \`write_file\` / \`edit_file\` 写入 workspace，路径：
   \`General/PRD - Spec 评审/<slug>-prd.md\`
2. **PRD 第一行必须含标题**，例如：\`# 通知中心重设计\` 或 \`# <产品事项> PRD\`
3. 写完后二选一或都做：
   - \`workflow_move_task\` → \`ai-review\`
   - \`handoff_to_agent\` → \`prd-reviewer\`（brief 含 PRD 路径 + 变更摘要）
4. 没有落盘路径 = 未完成。不要声称「已写好」却无文件。

## PRD 结构

1. 标题（第一行）
2. 背景与问题
3. 目标与成功指标
4. 用户与场景
5. 方案概述
6. 范围与 non-goals
7. 需求明细
8. 验收标准（When I do X, I see Y；BDD 可用）
9. 风险与开放问题

## 动作顺序

1. （若未加载）\`load_skill prd-write\`
2. 需要时 \`workflow_get\` / 读 brief 与已有草稿
3. \`write_file\` 写出完整 PRD（首行带标题）
4. 移交：move 到 \`ai-review\` 和/或 handoff \`prd-reviewer\`
`,
  },
  {
    id: "deep-research-pro",
    name: "deep-research-pro",
    description: "多源调研：先搜 workspace 与记忆，再综合带引用",
    body: `# Skill: deep-research-pro

1. \`search_workspace\` / \`memory_search\` / \`list_workspace\`
2. 阅读命中文档
3. 综合结论 + 路径引用
4. 不确定处标明缺口，不要编造外部数据
`,
  },
  {
    id: "humanizer",
    name: "humanizer",
    description: "去掉 AI 腔，改成自然中文产品文案",
    body: `# Skill: humanizer

改写时：短句、具体、少套话、不用「赋能/闭环/抓手」等空词。保留事实与数字。
`,
  },
];

export function ensureBundledSkills(workspaceRoot: string): void {
  const dir = skillsDir(workspaceRoot);
  fs.mkdirSync(dir, { recursive: true });
  const forceSync = process.env.YXT_FORCE_SKILL_SYNC === "1";
  for (const s of BUNDLED_SKILLS) {
    if (!s.body) continue;
    const p = path.join(dir, `${s.id}.md`);
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, s.body, "utf8");
      continue;
    }
    // Propagate bundled updates when disk copy is stale/truncated, or force sync.
    if (forceSync) {
      fs.writeFileSync(p, s.body, "utf8");
      continue;
    }
    try {
      const existing = fs.readFileSync(p, "utf8");
      if (existing.length < s.body.length) {
        fs.writeFileSync(p, s.body, "utf8");
      }
    } catch {
      fs.writeFileSync(p, s.body, "utf8");
    }
  }
  // Merge: bundled first, then preserve custom index entries (e.g. lessons-from-runs),
  // then any on-disk .md not yet listed.
  type Idx = { id: string; name: string; description: string };
  const byId = new Map<string, Idx>();
  for (const s of BUNDLED_SKILLS) {
    byId.set(s.id, {
      id: s.id,
      name: s.name,
      description: s.description,
    });
  }
  const indexPath = path.join(dir, "index.json");
  if (fs.existsSync(indexPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Idx[];
      if (Array.isArray(prev)) {
        for (const e of prev) {
          if (e?.id && !byId.has(e.id)) {
            byId.set(e.id, {
              id: e.id,
              name: e.name || e.id,
              description: e.description || `Custom skill ${e.id}`,
            });
          }
        }
      }
    } catch {
      /* ignore corrupt index */
    }
  }
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    const id = f.replace(/\.md$/, "");
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: id,
        description: `Custom skill ${id}`,
      });
    }
  }
  fs.writeFileSync(
    indexPath,
    JSON.stringify([...byId.values()], null, 2),
    "utf8",
  );
}

export function listSkillIndex(workspaceRoot: string): SkillManifest[] {
  ensureBundledSkills(workspaceRoot);
  const dir = skillsDir(workspaceRoot);
  const indexPath = path.join(dir, "index.json");
  let base: SkillManifest[] = [...BUNDLED_SKILLS];
  if (fs.existsSync(indexPath)) {
    try {
      const idx = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Array<{
        id: string;
        name: string;
        description: string;
      }>;
      // Merge disk index ids not in bundled
      for (const i of idx) {
        if (!base.find((b) => b.id === i.id)) {
          base.push({ ...i });
        }
      }
    } catch {
      /* ignore */
    }
  }
  // Load any extra .md
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    const id = f.replace(/\.md$/, "");
    if (!base.find((b) => b.id === id)) {
      base.push({
        id,
        name: id,
        description: `Custom skill ${id}`,
      });
    }
  }
  return base;
}

/** Skills index for system prompt (Ch2 progressive disclosure — names only). */
export function formatSkillsIndex(workspaceRoot: string): string {
  const skills = listSkillIndex(workspaceRoot);
  const lines = skills.map(
    (s) => `- ${s.id}: ${s.description || s.name}`,
  );
  return `## 可用 Skills（按需 load_skill 加载全文）\n${lines.join("\n")}`;
}

export function loadSkillBody(
  workspaceRoot: string,
  skillId: string,
): string | null {
  ensureBundledSkills(workspaceRoot);
  const p = path.join(skillsDir(workspaceRoot), `${skillId}.md`);
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  const bundled = BUNDLED_SKILLS.find((s) => s.id === skillId);
  return bundled?.body ?? null;
}

export function createSkillTool(): import("../types").ToolSpec {
  return {
    category: "perceive",
    definition: {
      type: "function",
      function: {
        name: "load_skill",
        description:
          "Load full skill instructions by id (Ch2 Agent Skills progressive disclosure). Call before applying a specialized procedure.",
        parameters: {
          type: "object",
          properties: {
            skillId: {
              type: "string",
              description: "Skill id from the skills index",
            },
          },
          required: ["skillId"],
        },
      },
    },
    handler: (args, ctx) => {
      const skillId =
        typeof args.skillId === "string" ? args.skillId : String(args.skillId ?? "");
      if (!skillId) return JSON.stringify({ ok: false, error: "skillId required" });
      const body = loadSkillBody(ctx.workspaceRoot, skillId);
      if (!body) {
        return JSON.stringify({
          ok: false,
          error: `skill not found: ${skillId}`,
          available: listSkillIndex(ctx.workspaceRoot).map((s) => s.id),
        });
      }
      return JSON.stringify({ ok: true, skillId, body });
    },
  };
}
