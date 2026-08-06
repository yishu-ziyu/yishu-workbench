import fs from "node:fs";
import path from "node:path";
import type { ToolSpec } from "../types";
import { assertSafePath } from "../guardrails";
import { parseArgsObject } from "./registry";

function safeResolve(root: string, rel: string): string {
  return assertSafePath(root, rel);
}

/**
 * Ch3 injection isolation: mark retrieved file bytes as data, not instructions.
 * Wrapper stays inside the `content` string; JSON still has `path` separately.
 */
export function wrapSourceContent(
  pathRel: string,
  content: string,
  extra?: { startLine?: number; endLine?: number; line?: number },
): string {
  let meta = `path=${pathRel}`;
  if (extra?.line != null) {
    meta += ` line=${extra.line}`;
  } else if (extra?.startLine != null) {
    meta += ` lines=${extra.startLine}-${extra.endLine ?? extra.startLine}`;
  }
  return `--- source: ${meta} ---\n${content}\n--- end source ---`;
}

export function sourceTagFor(
  pathRel: string,
  extra?: { startLine?: number; endLine?: number; line?: number },
): string {
  let tag = `source: path=${pathRel}`;
  if (extra?.line != null) tag += ` line=${extra.line}`;
  else if (extra?.startLine != null) {
    tag += ` lines=${extra.startLine}-${extra.endLine ?? extra.startLine}`;
  }
  return tag;
}

/** Count non-overlapping occurrences of needle in haystack. */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while (pos <= haystack.length) {
    const i = haystack.indexOf(needle, pos);
    if (i === -1) break;
    count += 1;
    pos = i + needle.length;
  }
  return count;
}

function walkFiles(
  root: string,
  dir: string,
  out: string[],
  max: number,
): void {
  if (out.length >= max) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= max) break;
    if (e.name.startsWith(".") && e.name !== ".agent") continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(root, full);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      walkFiles(root, full, out, max);
    } else {
      out.push(rel);
    }
  }
}

/**
 * Simple glob → RegExp. Supports only `*` (within one path segment) and
 * `**` (across segments). Not full regex; special chars are escaped.
 */
export function simpleGlobToRegExp(pattern: string): RegExp {
  const glob = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
  let out = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**/` → zero or more directory segments; bare `**` → any remainder
        if (glob[i + 2] === "/") {
          out += "(?:.+/)?";
          i += 3;
        } else {
          out += ".*";
          i += 2;
        }
      } else {
        out += "[^/]*";
        i += 1;
      }
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      out += "\\" + c;
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return new RegExp(`^${out}$`);
}

/** True when relative file path matches simple glob pattern. */
export function matchSimpleGlob(pattern: string, relPath: string): boolean {
  const file = relPath.replace(/\\/g, "/");
  return simpleGlobToRegExp(pattern).test(file);
}

/**
 * Assert glob pattern is workspace-safe: no absolute escape, no `..`.
 * Reuses assertSafePath on the pattern string (glob metas are path-safe literals).
 */
function assertSafeGlobPattern(root: string, pattern: string): void {
  if (pattern == null || String(pattern).trim() === "") {
    throw new Error("pattern required");
  }
  const raw = String(pattern).replace(/\\/g, "/");
  if (raw.split("/").some((seg) => seg === "..") || raw.includes("..")) {
    throw new Error("Path traversal blocked (..)");
  }
  // Strip leading ./ then sandbox-check (absolute / drive / resolve escape)
  const cleaned = raw.replace(/^\.\//, "");
  assertSafePath(root, cleaned);
}

export function createWorkspaceTools(): ToolSpec[] {
  return [
    {
      category: "perceive",
      definition: {
        type: "function",
        function: {
          name: "list_workspace",
          description:
            "List files under the product workspace (relative paths). Use to discover PRDs, workflow.md, Hub docs.",
          parameters: {
            type: "object",
            properties: {
              subpath: {
                type: "string",
                description: "Optional subdirectory relative to workspace root",
              },
              max: {
                type: "number",
                description: "Max files to return (default 200)",
              },
            },
          },
        },
      },
      handler: (args, ctx) => {
        const sub = parseArgsObject(args, "subpath", "");
        const max =
          typeof args.max === "number" && args.max > 0
            ? Math.min(args.max, 1000)
            : 200;
        const start = sub
          ? safeResolve(ctx.workspaceRoot, sub)
          : ctx.workspaceRoot;
        if (!fs.existsSync(start)) {
          return JSON.stringify({ ok: false, error: "path not found", sub });
        }
        const files: string[] = [];
        if (fs.statSync(start).isDirectory()) {
          walkFiles(ctx.workspaceRoot, start, files, max);
        } else {
          files.push(path.relative(ctx.workspaceRoot, start));
        }
        return JSON.stringify({ ok: true, count: files.length, files });
      },
    },
    {
      category: "perceive",
      definition: {
        type: "function",
        function: {
          name: "read_file",
          description:
            "Read a UTF-8 text file from the workspace by relative path. Prefer this before answering about document contents. Optional offsetLine (1-based) + limitLines for partial reads; returns totalLines/startLine/endLine so you can continue.",
          parameters: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Relative path, e.g. General/PRD - Spec 评审/workflow.md",
              },
              offsetLine: {
                type: "number",
                description: "1-based start line (optional; default 1)",
              },
              limitLines: {
                type: "number",
                description: "Max number of lines to return from offsetLine",
              },
              maxChars: {
                type: "number",
                description: "Truncate after N chars (default 30000)",
              },
            },
            required: ["path"],
          },
        },
      },
      handler: (args, ctx) => {
        const rel = parseArgsObject(args, "path");
        if (!rel) return JSON.stringify({ ok: false, error: "path required" });
        const abs = safeResolve(ctx.workspaceRoot, rel);
        if (!fs.existsSync(abs)) {
          return JSON.stringify({ ok: false, error: "not found", path: rel });
        }
        const max =
          typeof args.maxChars === "number" && args.maxChars > 0
            ? args.maxChars
            : 30000;
        const raw = fs.readFileSync(abs, "utf8");
        const lines = raw.split(/\r?\n/);
        const totalLines = lines.length;

        const hasOffset =
          typeof args.offsetLine === "number" && Number.isFinite(args.offsetLine);
        const hasLimit =
          typeof args.limitLines === "number" &&
          Number.isFinite(args.limitLines) &&
          (args.limitLines as number) > 0;

        // Full-file path: keep original bytes (incl. \r\n) for round-trip fidelity.
        if (!hasOffset && !hasLimit) {
          const truncated = raw.length > max;
          const body = truncated ? raw.slice(0, max) : raw;
          const range = { startLine: 1, endLine: totalLines };
          return JSON.stringify({
            ok: true,
            path: rel,
            truncated,
            content: wrapSourceContent(rel, body, range),
            source_tag: sourceTagFor(rel, range),
            totalLines,
            startLine: 1,
            endLine: totalLines,
          });
        }

        let startLine = 1;
        if (hasOffset) {
          startLine = Math.max(1, Math.floor(args.offsetLine as number));
        }

        let endLine = totalLines;
        if (hasLimit) {
          const limit = Math.floor(args.limitLines as number);
          endLine = Math.min(totalLines, startLine + limit - 1);
        }

        let content: string;
        if (startLine > totalLines) {
          content = "";
          endLine = totalLines;
        } else {
          content = lines.slice(startLine - 1, endLine).join("\n");
        }

        const truncated = content.length > max;
        if (truncated) {
          content = content.slice(0, max);
        }

        const range = {
          startLine: Math.min(startLine, totalLines + 1),
          endLine,
        };
        return JSON.stringify({
          ok: true,
          path: rel,
          truncated,
          content: wrapSourceContent(rel, content, range),
          source_tag: sourceTagFor(rel, range),
          totalLines,
          startLine: range.startLine,
          endLine: range.endLine,
        });
      },
    },
    {
      category: "execute",
      definition: {
        type: "function",
        function: {
          name: "write_file",
          description:
            "Write or overwrite a UTF-8 text file in the workspace. Creates parent directories. Use for PRD drafts, BDD, notes under General/ or Hub/.",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "Relative path to write" },
              content: { type: "string", description: "Full file content" },
            },
            required: ["path", "content"],
          },
        },
      },
      handler: (args, ctx) => {
        const rel = parseArgsObject(args, "path");
        const content =
          typeof args.content === "string" ? args.content : String(args.content ?? "");
        if (!rel) return JSON.stringify({ ok: false, error: "path required" });
        const abs = safeResolve(ctx.workspaceRoot, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, "utf8");
        return JSON.stringify({
          ok: true,
          path: rel,
          bytes: Buffer.byteLength(content, "utf8"),
        });
      },
    },
    {
      category: "execute",
      definition: {
        type: "function",
        function: {
          name: "edit_file",
          description:
            "Precise old_string→new_string edit in a workspace text file (Coding-agent style). Fails if old_string is missing or matches multiple times unless replace_all=true. Prefer over full write_file for small surgical edits.",
          parameters: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Relative path to edit",
              },
              old_string: {
                type: "string",
                description: "Exact text to find (must match file bytes, including whitespace)",
              },
              new_string: {
                type: "string",
                description: "Replacement text",
              },
              replace_all: {
                type: "boolean",
                description: "If true, replace every non-overlapping match (default false)",
              },
            },
            required: ["path", "old_string", "new_string"],
          },
        },
      },
      handler: (args, ctx) => {
        const rel = parseArgsObject(args, "path");
        if (!rel) return JSON.stringify({ ok: false, error: "path required" });
        if (typeof args.old_string !== "string") {
          return JSON.stringify({
            ok: false,
            error: "old_string required (string)",
          });
        }
        if (typeof args.new_string !== "string") {
          return JSON.stringify({
            ok: false,
            error: "new_string required (string)",
          });
        }
        const oldString = args.old_string;
        const newString = args.new_string;
        if (oldString.length === 0) {
          return JSON.stringify({
            ok: false,
            error: "old_string must be non-empty",
          });
        }
        const replaceAll = args.replace_all === true;
        const abs = safeResolve(ctx.workspaceRoot, rel);
        if (!fs.existsSync(abs)) {
          return JSON.stringify({ ok: false, error: "not found", path: rel });
        }
        const before = fs.readFileSync(abs, "utf8");
        const matches = countOccurrences(before, oldString);
        if (matches === 0) {
          const preview = before.slice(0, 120).replace(/\n/g, "\\n");
          return JSON.stringify({
            ok: false,
            error: "old_string not found",
            path: rel,
            hint: `No exact match. Check whitespace/newlines. File starts with: ${preview}${before.length > 120 ? "…" : ""}`,
            replacements: 0,
          });
        }
        if (matches > 1 && !replaceAll) {
          return JSON.stringify({
            ok: false,
            error: `old_string matches ${matches} times; set replace_all=true or provide a more unique string`,
            path: rel,
            matches,
            replacements: 0,
          });
        }
        const after = replaceAll
          ? before.split(oldString).join(newString)
          : before.replace(oldString, newString);
        const replacements = matches;
        fs.writeFileSync(abs, after, "utf8");
        return JSON.stringify({
          ok: true,
          path: rel,
          replacements,
          replace_all: replaceAll,
          bytes: Buffer.byteLength(after, "utf8"),
        });
      },
    },
    {
      category: "perceive",
      definition: {
        type: "function",
        function: {
          name: "search_workspace",
          description:
            "Case-insensitive substring search across workspace text files. Returns matching paths with line snippets.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search string" },
              maxHits: {
                type: "number",
                description: "Max hits (default 30)",
              },
            },
            required: ["query"],
          },
        },
      },
      handler: (args, ctx) => {
        const query = parseArgsObject(args, "query");
        if (!query) return JSON.stringify({ ok: false, error: "query required" });
        const max =
          typeof args.maxHits === "number" && args.maxHits > 0
            ? Math.min(args.maxHits, 100)
            : 30;
        const files: string[] = [];
        walkFiles(ctx.workspaceRoot, ctx.workspaceRoot, files, 2000);
        const q = query.toLowerCase();
        const hits: Array<{
          path: string;
          line: number;
          text: string;
          source_tag: string;
        }> = [];
        for (const rel of files) {
          if (hits.length >= max) break;
          if (!/\.(md|txt|json|workflow|csv|ts|tsx|js|mjs)$/i.test(rel)) continue;
          let text: string;
          try {
            text = fs.readFileSync(path.join(ctx.workspaceRoot, rel), "utf8");
          } catch {
            continue;
          }
          const lines = text.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            if (hits.length >= max) break;
            if (lines[i].toLowerCase().includes(q)) {
              const snippet = lines[i].slice(0, 240);
              const lineNo = i + 1;
              hits.push({
                path: rel,
                line: lineNo,
                text: wrapSourceContent(rel, snippet, { line: lineNo }),
                source_tag: sourceTagFor(rel, { line: lineNo }),
              });
            }
          }
        }
        return JSON.stringify({ ok: true, query, count: hits.length, hits });
      },
    },
    {
      category: "perceive",
      definition: {
        type: "function",
        function: {
          name: "glob_workspace",
          description:
            "Find files under the product workspace by simple glob pattern. Supports `*` (one path segment) and `**` (across segments) only - not full regex. Returns relative paths. Rejects patterns with `..` or absolute escape.",
          parameters: {
            type: "object",
            properties: {
              pattern: {
                type: "string",
                description:
                  "Glob relative to workspace root, e.g. Hub/*.md or **/*.workflow",
              },
              max: {
                type: "number",
                description: "Max files to return (default 200)",
              },
            },
            required: ["pattern"],
          },
        },
      },
      handler: (args, ctx) => {
        const pattern = parseArgsObject(args, "pattern");
        if (!pattern.trim()) {
          return JSON.stringify({ ok: false, error: "pattern required" });
        }
        assertSafeGlobPattern(ctx.workspaceRoot, pattern);
        const max =
          typeof args.max === "number" && args.max > 0
            ? Math.min(args.max, 1000)
            : 200;
        // Walk a generous candidate set, then filter by glob (cap at max matches)
        const candidates: string[] = [];
        walkFiles(ctx.workspaceRoot, ctx.workspaceRoot, candidates, 5000);
        const files: string[] = [];
        const normPattern = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
        for (const rel of candidates) {
          if (files.length >= max) break;
          const relPosix = rel.replace(/\\/g, "/");
          if (matchSimpleGlob(normPattern, relPosix)) {
            files.push(relPosix);
          }
        }
        return JSON.stringify({ ok: true, files });
      },
    },
  ];
}
