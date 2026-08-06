/**
 * Harness completion gates (Ch1 / Ch6).
 * Shared detectors so the ReAct loop and offline verify share one regex.
 */

/** PRD reviewer must emit one of: 结论：通过 | 有条件通过 | 打回 */
const PRD_VERDICT_RE = /结论\s*[：:]\s*(通过|有条件通过|打回)/;

/**
 * True when text contains a valid PRD review verdict line.
 * Accepts fullwidth or halfwidth colon; verdict keywords are exact.
 */
export function hasPrdVerdict(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return PRD_VERDICT_RE.test(text);
}

/** Regex source for tests / docs that need the pattern itself. */
export function prdVerdictPattern(): RegExp {
  return new RegExp(PRD_VERDICT_RE.source);
}
