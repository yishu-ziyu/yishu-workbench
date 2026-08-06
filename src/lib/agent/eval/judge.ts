import type { EvalCase, LlmProvider } from "../types";

export type HeuristicJudgeInput = Pick<
  EvalCase,
  "expectContains" | "forbidContains" | "expectTools"
> & {
  /** Tools actually used in the run (for coverage scoring). */
  toolsUsed?: string[];
};

export type HeuristicJudgeResult = {
  score: number;
  notes: string[];
};

export type LlmJudgeResult = {
  score: number;
  verdict: string;
  rationale: string;
};

/**
 * Offline judge (no LLM): score 0–1 from expectContains hits,
 * forbidContains cleanliness, and expectTools coverage.
 */
export function heuristicJudge(
  finalText: string,
  caseDef: HeuristicJudgeInput,
): HeuristicJudgeResult {
  const notes: string[] = [];
  const parts: number[] = [];
  const text = finalText ?? "";
  const toolsUsed = caseDef.toolsUsed ?? [];

  const expectContains = caseDef.expectContains ?? [];
  if (expectContains.length) {
    let hits = 0;
    for (const s of expectContains) {
      if (text.includes(s)) {
        hits += 1;
        notes.push(`expectContains hit: ${s}`);
      } else {
        notes.push(`expectContains miss: ${s}`);
      }
    }
    parts.push(hits / expectContains.length);
  }

  const forbidContains = caseDef.forbidContains ?? [];
  if (forbidContains.length) {
    let clean = 0;
    for (const s of forbidContains) {
      if (!text.includes(s)) {
        clean += 1;
        notes.push(`forbidContains clean: ${s}`);
      } else {
        notes.push(`forbidContains violated: ${s}`);
      }
    }
    parts.push(clean / forbidContains.length);
  }

  const expectTools = caseDef.expectTools ?? [];
  if (expectTools.length) {
    let hits = 0;
    for (const t of expectTools) {
      if (toolsUsed.includes(t)) {
        hits += 1;
        notes.push(`tool covered: ${t}`);
      } else {
        notes.push(`tool missing: ${t}`);
      }
    }
    parts.push(hits / expectTools.length);
  }

  if (!parts.length) {
    const ok = text.trim().length > 0;
    parts.push(ok ? 1 : 0);
    notes.push(ok ? "non-empty final" : "empty final");
  }

  const raw = parts.reduce((a, b) => a + b, 0) / parts.length;
  const score = Math.round(raw * 1000) / 1000;
  return { score, notes };
}

/**
 * Optional LLM-as-judge via OpenAI-compat chat (no tools).
 * Expects JSON: { score, verdict, rationale }.
 */
export async function llmJudge(
  provider: LlmProvider,
  rubric: string,
  finalText: string,
  prompt: string,
): Promise<LlmJudgeResult> {
  const system = [
    "You are a strict evaluation judge for an agent answer.",
    "Score only against the given rubric. Do not invent criteria.",
    'Respond with ONLY valid JSON (no markdown): {"score":0-1,"verdict":"pass|fail|uncertain","rationale":"short evidence-based reason"}',
  ].join(" ");

  const user = [
    "## Rubric",
    rubric.trim(),
    "",
    "## Original user prompt",
    prompt.trim(),
    "",
    "## Agent final answer",
    (finalText ?? "").trim() || "(empty)",
  ].join("\n");

  const res = await provider.chat({
    model: "judge",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0,
  });

  const raw = (res.message.content ?? "").trim();
  const parsed = parseJudgeJson(raw);
  if (!parsed) {
    return {
      score: 0,
      verdict: "uncertain",
      rationale: `judge JSON parse failed: ${raw.slice(0, 200)}`,
    };
  }

  const scoreNum = clamp01(Number(parsed.score));
  const verdict =
    typeof parsed.verdict === "string" && parsed.verdict
      ? parsed.verdict
      : scoreNum >= 0.7
        ? "pass"
        : scoreNum >= 0.4
          ? "uncertain"
          : "fail";
  const rationale =
    typeof parsed.rationale === "string"
      ? parsed.rationale
      : "no rationale";

  return { score: scoreNum, verdict, rationale };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return Math.round(n * 1000) / 1000;
}

function parseJudgeJson(
  raw: string,
): { score?: unknown; verdict?: unknown; rationale?: unknown } | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      score?: unknown;
      verdict?: unknown;
      rationale?: unknown;
    };
  } catch {
    /* try fenced or embedded object */
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1)) as {
        score?: unknown;
        verdict?: unknown;
        rationale?: unknown;
      };
    } catch {
      return null;
    }
  }
  return null;
}
