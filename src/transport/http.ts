import http from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { SafetyConfig } from "../config.js";
import { Session } from "../session.js";
import { buildServer } from "../server.js";

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(undefined);
      }
    });
    req.on("error", () => resolve(undefined));
  });
}

export function startHttp(cfg: SafetyConfig, host: string, port: number): void {
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const allowedHosts = [`${host}:${port}`, `127.0.0.1:${port}`, `localhost:${port}`];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname !== "/mcp") {
      res.writeHead(404).end();
      return;
    }

    const sid = req.headers["mcp-session-id"] as string | undefined;
    let transport = sid ? transports.get(sid) : undefined;
    const body = req.method === "POST" ? await readBody(req) : undefined;

    if (!transport) {
      if (req.method !== "POST" || !isInitializeRequest(body)) {
        res.writeHead(400, { "Content-Type": "application/json" }).end(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "no valid session; send initialize first" }, id: null }),
        );
        return;
      }
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableDnsRebindingProtection: true,
        allowedHosts,
        onsessioninitialized: (id) => {
          transports.set(id, transport!);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };
      // Each client session gets its own isolated Session + MCP server instance.
      const mcp = buildServer(new Session(), cfg);
      await mcp.connect(transport);
    }

    await transport.handleRequest(req, res, body);
  });

  server.listen(port, host, () => {
    console.error(`open-api-mcp HTTP transport on http://${host}:${port}/mcp (DNS-rebinding protection on)`);
  });
}
