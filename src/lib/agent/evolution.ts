/**
 * Ch8 continuous evolution - offline harvest from immutable trajectories.
 * Online path only records evidence (trajectory.ts); this module proposes
 * skill patches and writes lessons without touching verifier code.
 */
import fs from "node:fs";
import path from "node:path";
import type { Trajectory } from "./types";
import { skillsDir, trajectoriesDir } from "./paths";
import { harvestSkillDraft } from "./trajectory";

export type ToolCount = { name: string; count: number };

export type FailureSummary = {
  id: string;
  agentId?: string;
  error?: string;
  prompt?: string;
  endedAt?: string;
  tools?: string[];
};

export type TrajectoryAggregate = {
  total: number;
  successRate: number;
  topTools: ToolCount[];
  failures: FailureSummary[];
};

export type TrajectoryListItem = {
  id: string;
  agentId?: string;
  success?: boolean;
  endedAt?: string;
  tools?: string[];
  promptPreview?: string;
  error?: string;
};

type IndexLine = {
  id?: string;
  agentId?: string;
  success?: boolean;
  endedAt?: string;
  tools?: string[];
};

const LESSONS_SKILL_ID = "lessons-from-runs";
const LESSONS_SKILL_NAME = "lessons-from-runs";
const LESSONS_DESCRIPTION =
  "Lessons harvested from failed agent runs (Ch8 offline evolution)";

/** Load all trajectory JSON files under workspace/.agent/trajectories. */
export function loadAllTrajectories(workspaceRoot: string): Trajectory[] {
  const dir = trajectoriesDir(workspaceRoot);
  if (!fs.existsSync(dir)) return [];
  const out: Trajectory[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json") || f === "index.json") continue;
    try {
      const tr = JSON.parse(
        fs.readFileSync(path.join(dir, f), "utf8"),
      ) as Trajectory;
      if (tr && typeof tr.id === "string") out.push(tr);
    } catch {
      /* skip corrupt */
    }
  }
  return out;
}

/** Read index.jsonl (newest last); fall back to scanning trajectory files. */
export function listTrajectoryIndex(
  workspaceRoot: string,
  limit = 20,
): TrajectoryListItem[] {
  const dir = trajectoriesDir(workspaceRoot);
  if (!fs.existsSync(dir)) return [];

  const indexPath = path.join(dir, "index.jsonl");
  const fromIndex: TrajectoryListItem[] = [];
  if (fs.existsSync(indexPath)) {
    const lines = fs.readFileSync(indexPath, "utf8").split("\n");
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        const row = JSON.parse(t) as IndexLine;
        if (!row.id) continue;
        fromIndex.push({
          id: row.id,
          agentId: row.agentId,
          success: row.success,
          endedAt: row.endedAt,
          tools: row.tools,
        });
      } catch {
        /* skip bad line */
      }
    }
  }

  if (fromIndex.length) {
    return fromIndex.slice(-limit).reverse();
  }

  // Fallback: full files sorted by endedAt / startedAt
  const files = loadAllTrajectories(workspaceRoot);
  files.sort((a, b) => {
    const ta = a.endedAt || a.startedAt || "";
    const tb = b.endedAt || b.startedAt || "";
    return tb.localeCompare(ta);
  });
  return files.slice(0, limit).map((tr) => ({
    id: tr.id,
    agentId: tr.agentId,
    success: tr.success,
    endedAt: tr.endedAt,
    tools: tr.steps.flatMap((s) =>
      (s.toolCalls || []).map((c) => c.function.name),
    ),
    promptPreview: tr.prompt?.slice(0, 120),
    error: tr.error,
  }));
}

/**
 * Aggregate learning signals across trajectories (Ch8 offline summary).
 */
export function summarizeTrajectories(
  workspaceRoot: string,
): TrajectoryAggregate {
  const trajectories = loadAllTrajectories(workspaceRoot);
  const total = trajectories.length;
  if (total === 0) {
    return { total: 0, successRate: 0, topTools: [], failures: [] };
  }

  let successCount = 0;
  const toolCounts = new Map<string, number>();
  const failures: FailureSummary[] = [];

  for (const tr of trajectories) {
    if (tr.success === true) successCount += 1;

    const tools: string[] = [];
    for (const step of tr.steps || []) {
      for (const c of step.toolCalls || []) {
        const name = c.function?.name;
        if (!name) continue;
        tools.push(name);
        toolCounts.set(name, (toolCounts.get(name) || 0) + 1);
      }
    }

    if (tr.success === false) {
      failures.push({
        id: tr.id,
        agentId: tr.agentId,
        error: tr.error,
        prompt: tr.prompt?.slice(0, 160),
        endedAt: tr.endedAt,
        tools: [...new Set(tools)],
      });
    }
  }

  const topTools = [...toolCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Most recent failures first
  failures.sort((a, b) =>
    (b.endedAt || "").localeCompare(a.endedAt || ""),
  );

  return {
    total,
    successRate: successCount / total,
    topTools,
    failures: failures.slice(0, 30),
  };
}

/**
 * Propose a markdown skill patch from failed runs.
 * Reuses harvestSkillDraft and enriches with aggregate stats.
 */
export function proposeSkillPatch(workspaceRoot: string): string {
  const summary = summarizeTrajectories(workspaceRoot);
  let draft = "";
  try {
    draft = harvestSkillDraft(workspaceRoot) || "";
  } catch {
    draft = "";
  }
  const trajectories = loadAllTrajectories(workspaceRoot).filter(
    (t) => t.success === false,
  );

  if (summary.total === 0) {
    return `# Lessons from runs

_No trajectories recorded yet. Run the agent, then harvest again._
`;
  }

  const lines: string[] = [
    `# Lessons from runs`,
    ``,
    `> Auto-harvested offline from workspace trajectories (Ch8).`,
    `> Do not treat single failures as formal policy - look for repeated patterns.`,
    ``,
    `## Aggregate`,
    ``,
    `- Total runs: ${summary.total}`,
    `- Success rate: ${(summary.successRate * 100).toFixed(1)}%`,
    `- Failures: ${summary.failures.length}`,
    ``,
  ];

  if (summary.topTools.length) {
    lines.push(`## Top tools`, ``);
    for (const t of summary.topTools) {
      lines.push(`- \`${t.name}\` × ${t.count}`);
    }
    lines.push(``);
  }

  // Process-rule signals that scored low
  const weakRules = new Map<string, number>();
  for (const tr of trajectories) {
    for (const sig of tr.learningSignals || []) {
      if (sig.kind === "process_rule" && (sig.score ?? 1) < 0.5) {
        weakRules.set(sig.label, (weakRules.get(sig.label) || 0) + 1);
      }
    }
  }
  if (weakRules.size) {
    lines.push(`## Recurring process gaps`, ``);
    for (const [label, n] of [...weakRules.entries()].sort(
      (a, b) => b[1] - a[1],
    )) {
      lines.push(`- **${label}** (seen ${n}× on failed runs)`);
    }
    lines.push(``);
  }

  lines.push(`## Failure cases (recent)`, ``);
  if (summary.failures.length === 0) {
    lines.push(`_No failed trajectories._`, ``);
  } else {
    for (const f of summary.failures.slice(0, 20)) {
      const tools =
        f.tools && f.tools.length ? ` tools=[${f.tools.join(", ")}]` : "";
      lines.push(
        `- \`${f.id}\`${f.agentId ? ` agent=${f.agentId}` : ""}: ${f.error || "fail"}${tools}`,
      );
      if (f.prompt) lines.push(`  - prompt: ${f.prompt}`);
    }
    lines.push(``);
  }

  // Recommended procedures derived from failures
  lines.push(`## Recommended procedures`, ``);
  const tips = deriveProcedureTips(trajectories);
  if (tips.length === 0) {
    lines.push(
      `- Prefer \`read_file\` / \`search_workspace\` before asserting doc facts.`,
      `- On tool errors, surface the error text; do not claim success.`,
      `- Never skip humanGate stages in the PRD workflow.`,
    );
  } else {
    for (const tip of tips) lines.push(`- ${tip}`);
  }
  lines.push(``);

  if (draft.trim()) {
    lines.push(`## Raw harvest draft`, ``, draft.trim(), ``);
  }

  lines.push(
    `## Source trajectory ids`,
    ``,
    ...summary.failures.map((f) => `- ${f.id}`),
    ``,
  );

  return lines.join("\n");
}

function deriveProcedureTips(failed: Trajectory[]): string[] {
  const tips = new Set<string>();
  for (const tr of failed) {
    const tools = new Set<string>();
    for (const s of tr.steps || []) {
      for (const c of s.toolCalls || []) tools.add(c.function.name);
    }
    if (!tools.has("read_file") && !tools.has("search_workspace")) {
      tips.add(
        "Long or doc-related tasks: call `search_workspace` / `read_file` before answering from memory.",
      );
    }
    if (tr.error?.toLowerCase().includes("timeout")) {
      tips.add(
        "Timeouts: reduce maxIterations or split work via handoff_to_agent.",
      );
    }
    if (
      tr.error?.includes("not found") ||
      tr.error?.toLowerCase().includes("enoent")
    ) {
      tips.add(
        "Path errors: `list_workspace` first, then read with exact relative paths.",
      );
    }
    for (const sig of tr.learningSignals || []) {
      if (sig.label === "no_perception_tools") {
        tips.add(
          "Avoid answering long prompts with zero perception tools (hallucination risk).",
        );
      }
      if (sig.label === "empty_final") {
        tips.add("Always produce a non-empty final summary when marking success.");
      }
    }
  }
  return [...tips];
}

/**
 * Write lessons skill body + upsert skills index entry.
 * Returns absolute path of the skill markdown file.
 */
export function writeLessonsSkill(workspaceRoot: string): string {
  const dir = skillsDir(workspaceRoot);
  fs.mkdirSync(dir, { recursive: true });
  const body = proposeSkillPatch(workspaceRoot);
  const filePath = path.join(dir, `${LESSONS_SKILL_ID}.md`);
  fs.writeFileSync(filePath, body, "utf8");
  upsertSkillIndex(workspaceRoot, {
    id: LESSONS_SKILL_ID,
    name: LESSONS_SKILL_NAME,
    description: LESSONS_DESCRIPTION,
  });
  return filePath;
}

export function lessonsSkillId(): string {
  return LESSONS_SKILL_ID;
}

type SkillIndexEntry = { id: string; name: string; description: string };

function upsertSkillIndex(
  workspaceRoot: string,
  entry: SkillIndexEntry,
): void {
  const dir = skillsDir(workspaceRoot);
  fs.mkdirSync(dir, { recursive: true });
  const indexPath = path.join(dir, "index.json");
  let list: SkillIndexEntry[] = [];
  if (fs.existsSync(indexPath)) {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(indexPath, "utf8"),
      ) as SkillIndexEntry[];
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const i = list.findIndex((x) => x.id === entry.id);
  if (i >= 0) list[i] = entry;
  else list.push(entry);
  fs.writeFileSync(indexPath, JSON.stringify(list, null, 2), "utf8");
}

/**
 * Pure self-test for scripts (no network). Creates a temp workspace tree.
 * Throws on assertion failure.
 */
export function selfTestEvolution(tmpRoot?: string): {
  summary: TrajectoryAggregate;
  skillPath: string;
  patch: string;
} {
  const root =
    tmpRoot ||
    path.join(
      process.cwd(),
      `.evolution-selftest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    );
  const trajDir = trajectoriesDir(root);
  fs.mkdirSync(trajDir, { recursive: true });

  const okTr: Trajectory = {
    id: "tr-ok-1",
    conversationId: "c1",
    agentId: "momo",
    prompt: "list files",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
    success: true,
    finalText: "done",
    steps: [
      {
        iteration: 1,
        assistantContent: null,
        ts: "2026-01-01T00:00:00.500Z",
        toolCalls: [
          {
            id: "tc1",
            type: "function",
            function: { name: "list_workspace", arguments: "{}" },
          },
        ],
        toolResults: [
          { callId: "tc1", name: "list_workspace", result: "ok" },
        ],
      },
    ],
  };
  const failTr: Trajectory = {
    id: "tr-fail-1",
    conversationId: "c2",
    agentId: "prd-writer",
    prompt: "Write a full PRD for the billing module without reading docs",
    startedAt: "2026-01-02T00:00:00.000Z",
    endedAt: "2026-01-02T00:00:02.000Z",
    success: false,
    error: "tool timeout",
    finalText: "",
    steps: [
      {
        iteration: 1,
        assistantContent: "guessing",
        ts: "2026-01-02T00:00:01.000Z",
      },
    ],
    learningSignals: [
      {
        kind: "process_rule",
        label: "no_perception_tools",
        score: 0.3,
        note: "no read",
      },
    ],
  };

  fs.writeFileSync(
    path.join(trajDir, `${okTr.id}.json`),
    JSON.stringify(okTr, null, 2),
  );
  fs.writeFileSync(
    path.join(trajDir, `${failTr.id}.json`),
    JSON.stringify(failTr, null, 2),
  );
  fs.writeFileSync(
    path.join(trajDir, "index.jsonl"),
    [
      JSON.stringify({
        id: okTr.id,
        agentId: okTr.agentId,
        success: true,
        endedAt: okTr.endedAt,
        tools: ["list_workspace"],
      }),
      JSON.stringify({
        id: failTr.id,
        agentId: failTr.agentId,
        success: false,
        endedAt: failTr.endedAt,
        tools: [],
      }),
    ].join("\n") + "\n",
  );

  const summary = summarizeTrajectories(root);
  if (summary.total !== 2) {
    throw new Error(`expected total=2 got ${summary.total}`);
  }
  if (summary.successRate !== 0.5) {
    throw new Error(`expected successRate=0.5 got ${summary.successRate}`);
  }
  if (summary.failures.length !== 1 || summary.failures[0].id !== "tr-fail-1") {
    throw new Error("expected one failure tr-fail-1");
  }
  if (!summary.topTools.some((t) => t.name === "list_workspace")) {
    throw new Error("expected list_workspace in topTools");
  }

  const patch = proposeSkillPatch(root);
  if (!patch.includes("Lessons from runs")) {
    throw new Error("patch missing title");
  }
  if (!patch.includes("tr-fail-1")) {
    throw new Error("patch missing failure id");
  }

  const skillPath = writeLessonsSkill(root);
  if (!fs.existsSync(skillPath)) {
    throw new Error(`skill not written: ${skillPath}`);
  }
  const indexPath = path.join(skillsDir(root), "index.json");
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as SkillIndexEntry[];
  if (!index.some((e) => e.id === LESSONS_SKILL_ID)) {
    throw new Error("lessons-from-runs missing from index.json");
  }

  const listed = listTrajectoryIndex(root, 20);
  if (listed.length !== 2) {
    throw new Error(`listTrajectoryIndex expected 2 got ${listed.length}`);
  }

  // Cleanup only when we created the root
  if (!tmpRoot) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  return { summary, skillPath, patch };
}
