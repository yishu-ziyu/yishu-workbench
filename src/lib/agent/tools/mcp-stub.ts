/**
 * Minimal MCP-shaped tool discovery (Ch4) without full MCP protocol.
 * Descriptors are placeholders; mcp_call always reports not_configured.
 */
import type { ToolSpec } from "../types";
import { parseArgsObject } from "./registry";

export type McpDescriptor = {
  name: string;
  description: string;
  status: "not_configured";
};

const MCP_PLACEHOLDERS: McpDescriptor[] = [
  {
    name: "filesystem-extra",
    description:
      "Extra filesystem operations beyond workspace tools (MCP placeholder).",
    status: "not_configured",
  },
  {
    name: "github",
    description: "GitHub issues, PRs, and repo ops (MCP placeholder).",
    status: "not_configured",
  },
  {
    name: "browser",
    description: "Headless browser / page fetch (MCP placeholder).",
    status: "not_configured",
  },
];

/** Placeholder MCP server descriptors for discovery UI and list_mcp_servers. */
export function listMcpDescriptors(): McpDescriptor[] {
  return MCP_PLACEHOLDERS.map((d) => ({ ...d }));
}

export function createMcpStubTools(): ToolSpec[] {
  return [
    {
      category: "perceive",
      definition: {
        type: "function",
        function: {
          name: "list_mcp_servers",
          description:
            "List MCP-shaped integration placeholders (name, description, status). None are live until configured in Integrations.",
          parameters: {
            type: "object",
            properties: {},
          },
        },
      },
      handler: async () => {
        const servers = listMcpDescriptors();
        return JSON.stringify({ ok: true, servers, count: servers.length });
      },
    },
    {
      category: "execute",
      definition: {
        type: "function",
        function: {
          name: "mcp_call",
          description:
            "Call a named MCP server tool. Stub: always fails until the server is configured in Integrations.",
          parameters: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "MCP server name (e.g. github, browser)",
              },
              tool: {
                type: "string",
                description: "Remote tool name on that server (optional stub)",
              },
              args: {
                type: "object",
                description: "Arguments for the remote tool (optional stub)",
              },
            },
            required: ["name"],
          },
        },
      },
      handler: async (args) => {
        const name = parseArgsObject(args, "name").trim() || "unknown";
        return JSON.stringify({
          ok: false,
          error: `MCP server not configured: ${name}. Configure in Integrations.`,
        });
      },
    },
  ];
}
