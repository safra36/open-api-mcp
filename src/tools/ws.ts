import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Session } from "../session.js";
import { wsClose, wsConnect, wsExpect, wsRecv, wsSend } from "../ws/sockets.js";
import { text } from "../util.js";

export function registerWs(server: McpServer, session: Session): void {
  server.registerTool(
    "ws_connect",
    {
      title: "Open WebSocket",
      description: "Open a WebSocket connection. Auth headers/cookies are applied. Returns a socket id.",
      inputSchema: {
        url: z.string().describe("ws:// or wss:// URL"),
        id: z.string().optional().describe("name this socket (defaults to ws1, ws2, …)"),
        headers: z.record(z.string()).optional(),
      },
    },
    async (args) => text(await wsConnect(session, args)),
  );

  server.registerTool(
    "ws_send",
    {
      title: "Send WebSocket frame",
      description: "Send a frame on an open socket. Objects are JSON-encoded.",
      inputSchema: {
        id: z.string(),
        data: z.any().describe("string or object/array (objects are JSON-stringified)"),
        json: z.boolean().optional().describe("force JSON encoding even for strings"),
      },
    },
    async (args) => text(wsSend(session, args)),
  );

  server.registerTool(
    "ws_recv",
    {
      title: "Receive WebSocket frame",
      description: "Wait for the next inbound frame (optionally matching a regex), or time out.",
      inputSchema: {
        id: z.string(),
        timeoutMs: z.number().optional().describe("default 5000"),
        match: z.string().optional().describe("regex the frame text must match"),
      },
    },
    async (args) => text(await wsRecv(session, args)),
  );

  server.registerTool(
    "ws_expect",
    {
      title: "Expect typed WS frame",
      description:
        "Wait for the next inbound frame on a socket and assert it matches an AsyncAPI message schema for the given channel. Records a pass/fail result for export_report.",
      inputSchema: {
        id: z.string(),
        channel: z.string().describe("AsyncAPI channel name from app://manifest"),
        message: z.string().optional().describe("specific message name to match"),
        direction: z.enum(["publish", "subscribe"]).optional(),
        match: z.string().optional().describe("regex the frame text must match first"),
        timeoutMs: z.number().optional().describe("default 5000"),
      },
    },
    async (args) => text(await wsExpect(session, args)),
  );

  server.registerTool(
    "ws_close",
    {
      title: "Close WebSocket",
      description: "Close an open socket.",
      inputSchema: {
        id: z.string(),
        code: z.number().optional(),
        reason: z.string().optional(),
      },
    },
    async (args) => text(wsClose(session, args)),
  );
}
