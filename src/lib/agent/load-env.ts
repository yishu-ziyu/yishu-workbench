import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let loaded = false;

function applyEnvLine(line: string): void {
  let t = line.trim();
  if (!t || t.startsWith("#")) return;
  // support `export KEY=val` from ~/.cli-proxy-api/client.env
  if (t.startsWith("export ")) t = t.slice(7).trim();
  const i = t.indexOf("=");
  if (i < 0) return;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (k && process.env[k] === undefined) {
    process.env[k] = v;
  }
}

/**
 * Best-effort load of user AI provider env for Next.js server routes.
 * Does not override existing process.env keys.
 *
 * Order (later files do not override earlier keys):
 * 1. YXT_AI_ENV_FILE
 * 2. ~/.cli-proxy-api/client.env  — Grok 4.5 via local CLIProxy (8317)
 * 3. ~/.config/ai-providers/env.local — MiniMax / Stepfun / Volc fallbacks
 * 4. project .env.local
 */
export function ensureAiProviderEnv(): void {
  if (loaded) return;
  loaded = true;
  const home = os.homedir();
  const candidates = [
    process.env.YXT_AI_ENV_FILE,
    path.join(home, ".cli-proxy-api/client.env"),
    path.join(home, ".config/ai-providers/env.local"),
    path.join(process.cwd(), ".env.local"),
  ].filter(Boolean) as string[];

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        applyEnvLine(line);
      }
    } catch {
      /* ignore unreadable */
    }
  }

  // Defaults for this product: live tests / agent runtime prefer Grok 4.5
  // via CLIProxy OpenAI-compatible entry (see AI组件工作流库 · cli-proxy-api-subscription-pool)
  if (!process.env.YXT_LLM_PREFER) {
    process.env.YXT_LLM_PREFER = "grok";
  }
  if (!process.env.YXT_GROK_MODEL) {
    process.env.YXT_GROK_MODEL = "grok-4.5";
  }
  // If client.env set OPENAI_BASE_URL to 8317, map aliases used by resolveAutoProvider
  if (
    process.env.OPENAI_BASE_URL &&
    /8317|cli-proxy/i.test(process.env.OPENAI_BASE_URL) &&
    !process.env.GROK_BASE_URL
  ) {
    process.env.GROK_BASE_URL = process.env.OPENAI_BASE_URL;
  }
  if (process.env.OPENAI_API_KEY && !process.env.GROK_API_KEY) {
    // Local proxy key is not xAI secret; used only as bearer to 127.0.0.1:8317
    process.env.GROK_API_KEY = process.env.OPENAI_API_KEY;
  }
}
