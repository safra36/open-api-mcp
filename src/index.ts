#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { Session } from "./session.js";
import { buildServer } from "./server.js";
import { shutdownPool } from "./browser/pool.js";
import { startHttp } from "./transport/http.js";

async function main() {
  const cfg = loadConfig();
  const mode = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();

  if (mode === "http") {
    const host = process.env.MCP_BIND ?? "127.0.0.1";
    const port = Number(process.env.MCP_PORT ?? 7800);
    startHttp(cfg, host, port);
    return;
  }

  const session = new Session();
  const server = buildServer(session, cfg);
  await server.connect(new StdioServerTransport());

  console.error(
    `open-api-mcp ready (stdio, readOnly=${cfg.readOnly}, hostAllowlist=${cfg.hostAllowlist.join(",") || "*"})`,
  );

  const shutdown = async () => {
    for (const s of session.sockets.values()) s.ws.close();
    await shutdownPool();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
