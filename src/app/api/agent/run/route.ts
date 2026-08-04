import { runLocalCli, type CliOverride } from "@/lib/cli-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    prompt?: string;
    cliId?: string;
    cwd?: string;
    cli?: CliOverride | null;
  };

  const prompt = (body.prompt || "").trim();
  if (!prompt) {
    return new Response(JSON.stringify({ error: "prompt required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      try {
        for await (const ev of runLocalCli({
          cliId: body.cliId || body.cli?.id || "echo",
          prompt,
          cwd: body.cwd,
          override: body.cli || null,
        })) {
          send(ev);
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
