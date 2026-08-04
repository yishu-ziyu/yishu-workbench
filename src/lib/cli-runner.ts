import { spawn, execSync } from "node:child_process";
import { CLI_PROFILES } from "./seed";

export type RunEvent =
  | { type: "step"; kind: string; label: string; detail?: string }
  | { type: "token"; text: string }
  | { type: "done"; exitCode: number }
  | { type: "error"; message: string };

export type CliOverride = {
  id?: string;
  label?: string;
  command: string;
  args?: string[];
};

function whichSync(cmd: string): boolean {
  try {
    execSync(`command -v ${JSON.stringify(cmd).slice(1, -1)}`, {
      stdio: "ignore",
      shell: "/bin/bash",
    });
    return true;
  } catch {
    return false;
  }
}

export function listCliAvailability() {
  return CLI_PROFILES.map((p) => ({
    ...p,
    available: p.id === "echo" ? true : whichSync(p.command),
  }));
}

export async function* runLocalCli(opts: {
  cliId: string;
  prompt: string;
  cwd?: string;
  /** User-configured profile from settings — takes precedence over seed */
  override?: CliOverride | null;
}): AsyncGenerator<RunEvent> {
  const seed =
    CLI_PROFILES.find((c) => c.id === opts.cliId) ??
    CLI_PROFILES.find((c) => c.id === "echo")!;

  const profile = {
    id: opts.override?.id || seed.id,
    label: opts.override?.label || seed.label,
    command: (opts.override?.command || seed.command).trim() || seed.command,
    args: opts.override?.args?.length ? [...opts.override.args] : [...seed.args],
  };

  const cwd = opts.cwd || process.cwd();
  const cmdAvailable = profile.id === "echo" ? false : whichSync(profile.command);

  yield {
    type: "step",
    kind: "cli",
    label: `Local CLI: ${profile.label}`,
    detail: `${profile.command} ${profile.args.join(" ")}`.trim(),
  };

  let command = profile.command;
  let args = [...profile.args];

  if (profile.id === "echo" || !cmdAvailable) {
    // Fallback when binary missing OR explicit echo profile
    if (profile.id !== "echo" && opts.override?.command && cmdAvailable === false) {
      // try spawn user command with prompt appended anyway if path is absolute
      if (profile.command.startsWith("/") || profile.command.startsWith(".")) {
        args = [...args, opts.prompt];
      } else {
        command = "bash";
        args = [
          "-lc",
          `printf '%s\\n' ${JSON.stringify(
            `[YXT · local agent]\nCLI: ${profile.label}\ncommand: ${profile.command} (not found on PATH)\nargs: ${profile.args.join(" ")}\n\nYou said:\n${opts.prompt}\n\n---\n回环响应。安装 CLI 或写入绝对路径后可真跑。`,
          )}`,
        ];
      }
    } else {
      command = "bash";
      args = [
        "-lc",
        `printf '%s\\n' ${JSON.stringify(
          `[YXT · local agent]\nCLI profile: ${profile.label}\ncommand: ${profile.command}\n\nYou said:\n${opts.prompt}\n\n---\n这是本地 CLI 适配器的回环响应。UI 与 Moxt 对齐；推理算力走本机。`,
        )}`,
      ];
    }
  } else if (profile.id === "claude" || profile.command.includes("claude")) {
    // Prefer known claude print mode; still honor extra user args prefix if any custom
    const base = profile.args.length ? profile.args : ["-p", "--output-format", "text"];
    // avoid double-prompt if already includes placeholder
    args = base.includes(opts.prompt) ? base : [...base, opts.prompt];
  } else if (profile.id === "codex" || profile.command.includes("codex")) {
    const base = profile.args.length ? profile.args : ["exec"];
    args = base.includes(opts.prompt) ? base : [...base, opts.prompt];
  } else {
    // generic custom CLI: args + prompt as last arg
    args = [...args, opts.prompt];
  }

  yield { type: "step", kind: "think", label: "思考中" };
  yield {
    type: "step",
    kind: "log",
    label: `spawn: ${command}`,
    detail: args.join(" ").slice(0, 200),
  };
  yield {
    type: "step",
    kind: "log",
    label: `cwd: ${cwd}`,
  };

  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (buf: Buffer) => {
    stderr += buf.toString("utf8");
  });

  const queue: RunEvent[] = [];
  let resolveWait: (() => void) | null = null;
  let closed = false;

  const wake = () => {
    if (resolveWait) {
      resolveWait();
      resolveWait = null;
    }
  };

  child.stdout.on("data", (buf: Buffer) => {
    queue.push({ type: "token", text: buf.toString("utf8") });
    wake();
  });

  child.on("error", (err) => {
    queue.push({ type: "error", message: err.message });
    closed = true;
    wake();
  });

  child.on("close", (code) => {
    if (stderr.trim()) {
      queue.push({
        type: "step",
        kind: "log",
        label: "stderr",
        detail: stderr.slice(0, 2000),
      });
    }
    queue.push({ type: "done", exitCode: code ?? 0 });
    closed = true;
    wake();
  });

  while (!closed || queue.length) {
    if (!queue.length) {
      await new Promise<void>((r) => {
        resolveWait = r;
      });
      continue;
    }
    const ev = queue.shift()!;
    yield ev;
  }
}
