/**
 * Gated shell execution tool (Ch4 execute).
 * dangerous=true; blocked unless ctx.state.allowDangerous.
 * Allowlist only: ls, pwd, date, wc - via bash -lc, timeout 5s.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolSpec } from "../types";
import { parseArgsObject } from "./registry";

const execFileAsync = promisify(execFile);

const ALLOWED_CMDS = new Set(["ls", "pwd", "date", "wc"]);
const TIMEOUT_MS = 5000;

function firstToken(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return "";
  // strip simple env PREFIX=val prefixes not supported; first word only
  const m = trimmed.match(/^([A-Za-z0-9_./-]+)/);
  return m ? m[1] : "";
}

export function createShellTools(): ToolSpec[] {
  return [
    {
      category: "execute",
      dangerous: true,
      definition: {
        type: "function",
        function: {
          name: "shell_exec",
          description:
            "Run a short allowlisted shell command (ls, pwd, date, wc) in the workspace. Dangerous: requires allowDangerous. Timeout 5s.",
          parameters: {
            type: "object",
            properties: {
              command: {
                type: "string",
                description: "Shell command; first token must be ls|pwd|date|wc",
              },
            },
            required: ["command"],
          },
        },
      },
      handler: async (args, ctx) => {
        const command = parseArgsObject(args, "command");
        if (!command.trim()) {
          return JSON.stringify({ ok: false, error: "command required" });
        }
        const bin = firstToken(command);
        // basename for paths like /bin/ls
        const base = bin.includes("/") ? bin.split("/").pop() || bin : bin;
        if (!ALLOWED_CMDS.has(base)) {
          return JSON.stringify({
            ok: false,
            error: `Command not allowlisted: ${base || "(empty)"}. Allowed: ${[...ALLOWED_CMDS].join(", ")}`,
          });
        }
        try {
          const { stdout, stderr } = await execFileAsync(
            "bash",
            ["-lc", command],
            {
              cwd: ctx.workspaceRoot,
              timeout: TIMEOUT_MS,
              maxBuffer: 256 * 1024,
              env: {
                ...process.env,
                PATH: process.env.PATH,
                HOME: process.env.HOME,
                LANG: process.env.LANG || "en_US.UTF-8",
              },
            },
          );
          return JSON.stringify({
            ok: true,
            command,
            stdout: (stdout || "").slice(0, 8000),
            stderr: (stderr || "").slice(0, 2000),
          });
        } catch (e) {
          const err = e as {
            message?: string;
            stdout?: string;
            stderr?: string;
            killed?: boolean;
            code?: number | string;
          };
          return JSON.stringify({
            ok: false,
            error: err.message || String(e),
            stdout: (err.stdout || "").slice(0, 4000),
            stderr: (err.stderr || "").slice(0, 2000),
            timedOut: Boolean(err.killed),
            code: err.code,
          });
        }
      },
    },
  ];
}
