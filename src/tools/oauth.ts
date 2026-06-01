import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { oauthToken } from "../oauth.js";
import type { Session } from "../session.js";
import { text } from "../util.js";

export function registerOAuth(server: McpServer, session: Session): void {
  server.registerTool(
    "oauth_token",
    {
      title: "OAuth token",
      description:
        "Fetch an OAuth2 access token (client_credentials, password, or refresh_token grant) from a token endpoint and set it as the bearer token for all planes. Tokens are auto-refreshed before they expire.",
      inputSchema: {
        tokenUrl: z.string().describe("the OAuth2 token endpoint"),
        grant: z.enum(["client_credentials", "password", "refresh_token"]),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        username: z.string().optional().describe("for the password grant"),
        password: z.string().optional().describe("for the password grant"),
        refreshToken: z.string().optional().describe("for the refresh_token grant"),
        scope: z.string().optional(),
        audience: z.string().optional(),
        clientAuth: z.enum(["basic", "body"]).optional().describe("how to send client credentials (default: basic if secret present)"),
      },
    },
    async (args) => text(await oauthToken(session, args)),
  );
}
