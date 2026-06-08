import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Session } from "../session.js";
import { sioClose, sioConnect, sioEmit, sioExpect, sioRecv } from "../ws/socketio.js";
import { text } from "../util.js";

export function registerSio(server: McpServer, session: Session): void {
  server.registerTool(
    "sio_connect",
    {
      title: "Open Socket.IO connection",
      description:
        "Open a Socket.IO (Engine.IO) connection. Supports BOTH auth styles: (1) cookie-session — the session cookie jar (from an HTTP/browser login) plus any explicit headers are sent as the handshake's HTTP headers, so the server reads socket.request.headers.cookie; and (2) token/handshake — a session bearer token (and the `auth` arg) is offered as handshake auth.token. The namespace defaults to the URL path. Returns a socket id.",
      inputSchema: {
        url: z.string().describe("http:// or https:// origin, optionally with a namespace path (e.g. http://host/chat)"),
        id: z.string().optional().describe("name this socket (defaults to sio1, sio2, …)"),
        namespace: z.string().optional().describe("Socket.IO namespace, e.g. /chat (overrides the URL path)"),
        auth: z.record(z.any()).optional().describe("handshake auth payload, e.g. { token } or { apiKey }"),
        headers: z.record(z.string()).optional().describe("extra handshake HTTP headers, e.g. { Cookie } for cookie-session auth"),
        path: z.string().optional().describe("engine.io mount path (default /socket.io)"),
        transports: z.array(z.enum(["websocket", "polling"])).optional().describe("transport preference order (default [websocket, polling])"),
      },
    },
    async (args) => text(await sioConnect(session, args)),
  );

  server.registerTool(
    "sio_emit",
    {
      title: "Emit Socket.IO event",
      description:
        "Emit a named event on an open Socket.IO connection. Pass args as a single value or an array of arguments. Set ack:true to wait for the server's acknowledgement callback.",
      inputSchema: {
        id: z.string(),
        event: z.string().describe("event name to emit"),
        args: z.any().optional().describe("payload: a single value, or an array spread as multiple emit arguments"),
        ack: z.boolean().optional().describe("wait for the server's ack callback and return its value"),
        ackTimeoutMs: z.number().optional().describe("ack wait timeout, default 5000"),
      },
    },
    async (args) => text(await sioEmit(session, args)),
  );

  server.registerTool(
    "sio_recv",
    {
      title: "Receive Socket.IO event",
      description: "Wait for the next inbound event (optionally a specific event name and/or payload regex), or time out.",
      inputSchema: {
        id: z.string(),
        event: z.string().optional().describe("only match this event name"),
        match: z.string().optional().describe("regex the event payload must match"),
        timeoutMs: z.number().optional().describe("default 5000"),
      },
    },
    async (args) => text(await sioRecv(session, args)),
  );

  server.registerTool(
    "sio_expect",
    {
      title: "Expect typed Socket.IO event",
      description:
        "Wait for a named inbound event and assert its payload matches an AsyncAPI message schema. The channel defaults to the event name. Records a pass/fail result for export_report.",
      inputSchema: {
        id: z.string(),
        event: z.string().describe("event name to wait for"),
        channel: z.string().optional().describe("AsyncAPI channel to validate against (defaults to the event name)"),
        message: z.string().optional().describe("specific message name to match"),
        direction: z.enum(["publish", "subscribe"]).optional(),
        match: z.string().optional().describe("regex the payload must match first"),
        timeoutMs: z.number().optional().describe("default 5000"),
      },
    },
    async (args) => text(await sioExpect(session, args)),
  );

  server.registerTool(
    "sio_close",
    {
      title: "Close Socket.IO connection",
      description: "Close an open Socket.IO connection.",
      inputSchema: {
        id: z.string(),
      },
    },
    async (args) => text(sioClose(session, args)),
  );
}
