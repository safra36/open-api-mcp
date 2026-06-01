import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SafetyConfig } from "./config.js";
import type { Session } from "./session.js";
import { registerKnowledge } from "./tools/knowledge.js";
import { registerHttp } from "./tools/http.js";
import { registerOAuth } from "./tools/oauth.js";
import { registerWs } from "./tools/ws.js";
import { registerBrowser } from "./tools/browser.js";
import { registerReport } from "./tools/report.js";

export function buildServer(session: Session, cfg: SafetyConfig): McpServer {
  const server = new McpServer({ name: "open-api-mcp", version: "0.1.0" });
  registerKnowledge(server, session);
  registerHttp(server, session, cfg);
  registerOAuth(server, session);
  registerWs(server, session);
  registerBrowser(server, session);
  registerReport(server, session);
  return server;
}
