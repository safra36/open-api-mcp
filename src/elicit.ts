import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Ask the user for a single text value via MCP elicitation.
 * Returns the value if the client supports elicitation and the user provides it,
 * otherwise `undefined` — callers then fall back to returning guidance for the agent.
 */
export async function elicitText(server: McpServer, message: string, field: string): Promise<string | undefined> {
  const caps = server.server.getClientCapabilities();
  if (!caps?.elicitation) return undefined; // client can't prompt the human directly

  try {
    const res = await server.server.elicitInput({
      message,
      requestedSchema: {
        type: "object",
        properties: { [field]: { type: "string", title: field, description: message } },
        required: [field],
      },
    });
    if (res.action === "accept" && res.content) {
      const v = String(res.content[field] ?? "").trim();
      return v || undefined;
    }
  } catch {
    /* client rejected / unsupported — fall back to guidance */
  }
  return undefined;
}
