import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SafetyConfig } from "../config.js";
import { applyAuth } from "../auth.js";
import { elicitText } from "../elicit.js";
import { httpRequest } from "../http/request.js";
import type { Session } from "../session.js";
import { validateLast } from "../spec/validate.js";
import { text } from "../util.js";

export function registerHttp(server: McpServer, session: Session, cfg: SafetyConfig): void {
  server.registerTool(
    "auth_set",
    {
      title: "Set auth",
      description: "Set static auth applied to every subsequent http_request and ws_connect.",
      inputSchema: {
        type: z.enum(["bearer", "header", "basic", "cookie"]),
        token: z.string().optional(),
        headerName: z.string().optional(),
        value: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        cookieName: z.string().optional(),
      },
    },
    async (args) => {
      const a = { ...args };
      // If the agent knows which auth is needed but not the secret, ask the user for it.
      if (a.type === "bearer" && !a.token) a.token = await elicitText(server, "Paste the bearer token for this API", "token");
      else if (a.type === "header" && a.headerName && a.value === undefined)
        a.value = await elicitText(server, `Value for header "${a.headerName}"`, "value");
      else if (a.type === "cookie" && a.value === undefined && a.token === undefined)
        a.value = await elicitText(server, `Value for cookie "${a.cookieName ?? "session"}"`, "value");
      return text({ ok: true, detail: applyAuth(session, a) });
    },
  );

  server.registerTool(
    "http_request",
    {
      title: "HTTP request",
      description:
        "Make an HTTP request. Use `path` (resolved against the spec base URL) or an absolute `url`. Auth + cookies are applied automatically; the response is stored for http_validate_last.",
      inputSchema: {
        method: z.string().describe("GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS"),
        path: z.string().optional().describe("path relative to the spec base URL, e.g. /orders/42"),
        url: z.string().optional().describe("absolute URL (overrides path/base URL)"),
        query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
        headers: z.record(z.string()).optional(),
        body: z.any().optional().describe("object (sent as JSON) or raw string"),
        dryRun: z.boolean().optional().describe("compose the request and return it without sending"),
        confirm: z.boolean().optional().describe("required to send mutating calls when MCP_REQUIRE_CONFIRM is set"),
      },
    },
    async (args) => {
      // No target known yet? Ask the user for the base URL rather than guessing.
      if (!args.url && !session.spec?.baseUrl && !session.baseUrl) {
        const v = await elicitText(server, "What base URL is the app running at? (e.g. http://localhost:3000)", "base_url");
        if (v) session.baseUrl = v;
      }
      return text(await httpRequest(session, cfg, args));
    },
  );

  server.registerTool(
    "http_validate_last",
    {
      title: "Validate last response",
      description:
        "Validate the last HTTP response body against the response schema the OpenAPI spec promised for its status code. Reports schema drift.",
      inputSchema: {},
    },
    async () => {
      const result = validateLast(session.spec, session.lastResponse);
      if (result.validated) {
        session.results.push({
          name: `validate ${result.path ?? "response"} (${result.status ?? "?"})`,
          ok: result.valid === true,
          detail: result.valid ? "matches schema" : (result.errors ?? []).join("; "),
          at: Date.now(),
        });
      }
      return text(result);
    },
  );
}
