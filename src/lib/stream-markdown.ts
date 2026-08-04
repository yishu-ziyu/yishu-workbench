/**
 * Stream-safe markdown helpers (streamdown-class behavior).
 * Closes incomplete fences / lists so partial AI streams do not break layout.
 */

/** Count unescaped triple-backtick fences; odd count => open fence. */
export function hasIncompleteFence(content: string): boolean {
  // Match ``` optionally with lang on open; ignore single backticks
  const fences = content.match(/^```/gm);
  return Boolean(fences && fences.length % 2 === 1);
}

/**
 * Stabilize streaming markdown so incomplete constructs parse safely.
 * - Odd ``` fences → append closing ```
 * - Trailing incomplete table row left as-is (GFM tolerant enough after fence fix)
 */
export function stabilizeStreamingMarkdown(content: string): string {
  if (!content) return content;
  let out = content;
  if (hasIncompleteFence(out)) {
    // If last fence line is only ```lang without body, still close
    if (!out.endsWith("\n")) out += "\n";
    out += "```";
  }
  return out;
}

/** True if stabilized complete fence content should show a code block structure. */
export function looksLikeCompleteCodeFence(content: string): boolean {
  return /```[\w-]*\n[\s\S]*?```/.test(content);
}
