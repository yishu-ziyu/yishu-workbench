import type {
  ToolContext,
  ToolDefinition,
  ToolSpec,
} from "../types";
import { redactSecrets, validateToolArgs } from "../guardrails";

export class ToolRegistry {
  private tools = new Map<string, ToolSpec>();

  register(spec: ToolSpec): void {
    const name = spec.definition.function.name;
    if (this.tools.has(name)) {
      throw new Error(`Tool already registered: ${name}`);
    }
    this.tools.set(name, spec);
  }

  registerAll(specs: ToolSpec[]): void {
    for (const s of specs) this.register(s);
  }

  get(name: string): ToolSpec | undefined {
    return this.tools.get(name);
  }

  listDefinitions(allowlist?: string[]): ToolDefinition[] {
    const all = [...this.tools.values()];
    const filtered = allowlist?.length
      ? all.filter((t) => allowlist.includes(t.definition.function.name))
      : all;
    return filtered.map((t) => t.definition);
  }

  listNames(): string[] {
    return [...this.tools.keys()];
  }

  async execute(
    name: string,
    argsJson: string,
    ctx: ToolContext,
  ): Promise<string> {
    const spec = this.tools.get(name);
    if (!spec) {
      return redactSecrets(
        JSON.stringify({
          ok: false,
          error: `Unknown tool: ${name}. Available: ${this.listNames().join(", ")}`,
        }),
      );
    }
    let args: Record<string, unknown> = {};
    try {
      args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
    } catch (e) {
      return redactSecrets(
        JSON.stringify({
          ok: false,
          error: `Invalid JSON arguments for ${name}: ${e instanceof Error ? e.message : String(e)}`,
        }),
      );
    }

    const validation = validateToolArgs(name, args);
    if (!validation.ok) {
      return redactSecrets(
        JSON.stringify({
          ok: false,
          error: validation.error || "invalid tool args",
        }),
      );
    }

    if (spec.dangerous && !ctx.state.allowDangerous) {
      return redactSecrets(
        JSON.stringify({
          ok: false,
          error: `Tool ${name} is dangerous and blocked without allowDangerous`,
          requires_approval: true,
        }),
      );
    }

    try {
      const result = await spec.handler(args, ctx);
      const raw = typeof result === "string" ? result : JSON.stringify(result);
      return redactSecrets(raw);
    } catch (e) {
      return redactSecrets(
        JSON.stringify({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }
}

export function parseArgsObject(
  args: Record<string, unknown>,
  key: string,
  fallback?: string,
): string {
  const v = args[key];
  if (typeof v === "string") return v;
  if (v == null && fallback !== undefined) return fallback;
  return String(v ?? "");
}
