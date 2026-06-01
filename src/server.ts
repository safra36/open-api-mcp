import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SafetyConfig } from "./config.js";
import type { Session } from "./session.js";
import { registerKnowledge } from "./tools/knowledge.js";
import { registerHttp } from "./tools/http.js";
import { registerOAuth } from "./tools/oauth.js";
import { registerWs } from "./tools/ws.js";
import { registerBrowser } from "./tools/browser.js";
import { registerReport } from "./tools/report.js";
import { registerPrompts } from "./tools/prompts.js";

const INSTRUCTIONS = `This server tests live APIs across HTTP, WebSocket, and a real browser, validating responses and frames against OpenAPI/AsyncAPI schemas.

Always start a testing session by establishing a contract:
1. Call load_spec with the app's base URL to auto-discover a served spec (/openapi.json, /swagger.json, /v3/api-docs, …).
2. If load_spec reports NO_SPEC_FOUND, do not test blindly: review the target project's source code (routes, controllers/handlers, request/response models), build an OpenAPI 3 document covering every endpoint and response shape, and register it with synthesize_spec({ spec, baseUrl }) — this keeps it in memory and writes no file into the target project. (Only write ./api-spec.json + load_spec if you specifically want it persisted.) The spec you derive from the code is what makes schema-drift validation possible. Tip: set_target({ baseUrl, bearerToken }) primes the URL and auth up front so you aren't prompted mid-run.
3. Read app://manifest for the operation list, then exercise each operation with http_request, checking each with http_validate_last and assert.
4. Use auth_set / oauth_token for auth, ws_connect / ws_expect for WebSocket channels, and browser_* for UI flows (browser_capture_auth propagates a UI login to all planes).
5. Finish with export_report (junit/har/json); read app://report at any time for the running tally.

Never fabricate a base URL, token, or credential. If you don't have a required input — the base URL, an auth token, an API key — ask the user for it before proceeding. Some tools will prompt the user directly (elicitation); when a tool result says MISSING_INPUT or authRequired, stop and get that value from the user, then retry. A 401/403 means you need credentials: ask the user, then use auth_set or oauth_token, or log in via browser_open + browser_capture_auth.

The api_test prompt encodes this whole flow if the user invokes it.`;

export function buildServer(session: Session, cfg: SafetyConfig): McpServer {
  const server = new McpServer({ name: "open-api-mcp", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  registerKnowledge(server, session);
  registerHttp(server, session, cfg);
  registerOAuth(server, session);
  registerWs(server, session);
  registerBrowser(server, session);
  registerReport(server, session);
  registerPrompts(server);
  return server;
}
