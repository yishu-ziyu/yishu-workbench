import { runLocalCli, type CliOverride } from "@/lib/cli-runner";
import { runAgentLoop } from "@/lib/agent/loop";
import { runMultiAgent, BUSINESS_AGENTS } from "@/lib/agent/multi/orchestrator";
import type { AgentProfileRuntime, RunRequest } from "@/lib/agent/types";
import { resolveAutoProvider } from "@/lib/agent/providers/openai-compat";
import { ensureAiProviderEnv } from "@/lib/agent/load-env";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

ensureAiProviderEnv();

type Body = {
  prompt?: string;
  cliId?: string;
  cwd?: string;
  cli?: CliOverride | null;
  /** agent-runtime (default when LLM available) | cli | multi */
  mode?: "auto" | "agent" | "cli" | "multi";
  agentId?: string;
  conversationId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  maxIterations?: number;
  multiAgent?: boolean;
  model?: string;
};

function resolveCwd(bodyCwd?: string): string {
  if (bodyCwd?.trim()) return bodyCwd.trim();
  if (process.env.YXT_WORKSPACE_ROOT?.trim()) {
    return process.env.YXT_WORKSPACE_ROOT.trim();
  }
  return path.join(process.cwd(), "workspace");
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const prompt = (body.prompt || "").trim();
  if (!prompt) {
    return new Response(JSON.stringify({ error: "prompt required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cwd = resolveCwd(body.cwd);
  const mode = body.mode || "auto";
  const auto = resolveAutoProvider();
  const useAgent =
    mode === "agent" ||
    mode === "multi" ||
    (mode === "auto" && !!auto.provider);
  const useMulti =
    mode === "multi" || body.multiAgent === true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      try {
        if (!useAgent) {
          // Legacy local CLI path
          for await (const ev of runLocalCli({
            cliId: body.cliId || body.cli?.id || "echo",
            prompt,
            cwd,
            override: body.cli || null,
          })) {
            send(ev);
          }
          return;
        }

        const agentId = body.agentId || "momo";
        const agent: AgentProfileRuntime =
          BUSINESS_AGENTS[agentId] || {
            id: agentId,
            name: agentId,
            role: "AI 同事",
          };

        const runReq: RunRequest = {
          prompt,
          cwd,
          agentId,
          agent,
          conversationId: body.conversationId,
          history: body.history,
          maxIterations: body.maxIterations ?? 12,
          model: body.model || auto.model,
          multiAgent: useMulti,
          provider: "auto",
        };

        send({
          type: "step",
          kind: "log",
          label: useMulti ? "Agent runtime · multi" : "Agent runtime",
          detail: `${auto.reason} · ${runReq.model}`,
        });

        if (useMulti) {
          for await (const ev of runMultiAgent(runReq, {
            model: runReq.model,
          })) {
            send(ev);
          }
        } else {
          for await (const ev of runAgentLoop(runReq)) {
            send(ev);
          }
        }
      } catch (e) {
        send({
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
