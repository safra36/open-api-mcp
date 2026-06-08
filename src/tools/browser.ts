import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Session } from "../session.js";
import * as b from "../browser/browser.js";
import { text } from "../util.js";

const idArg = z.string().optional().describe("page id (default: main)");

export function registerBrowser(server: McpServer, session: Session): void {
  server.registerTool(
    "browser_open",
    {
      title: "Open page",
      description: "Launch a headless browser page (reused per id) and navigate to a URL.",
      inputSchema: { url: z.string(), id: idArg },
    },
    async (args) => text(await b.browserOpen(session, args)),
  );

  server.registerTool(
    "browser_snapshot",
    {
      title: "Accessibility snapshot",
      description: "Return the page's accessibility (aria) tree — use it to find selectors for browser_act.",
      inputSchema: { id: idArg },
    },
    async (args) => text(await b.browserSnapshot(session, args)),
  );

  server.registerTool(
    "browser_act",
    {
      title: "Act on page",
      description: "Interact with an element by selector (CSS, text=, or role=… Playwright selectors).",
      inputSchema: {
        action: z.enum(["click", "fill", "select", "press", "hover"]),
        selector: z.string(),
        value: z.string().optional().describe("text to fill, option to select, or key to press"),
        id: idArg,
      },
    },
    async (args) => text(await b.browserAct(session, args)),
  );

  server.registerTool(
    "browser_eval",
    {
      title: "Eval in page",
      description: "Run a JS expression in the page context and return the result (escape hatch).",
      inputSchema: { expression: z.string(), id: idArg },
    },
    async (args) => text(await b.browserEval(session, args)),
  );

  server.registerTool(
    "browser_screenshot",
    {
      title: "Screenshot",
      description: "Capture a PNG screenshot of the page.",
      inputSchema: { id: idArg, fullPage: z.boolean().optional() },
    },
    async (args) => {
      const shot = await b.browserScreenshot(session, args);
      return { content: [{ type: "image" as const, data: shot.base64, mimeType: shot.mime }] };
    },
  );

  server.registerTool(
    "browser_network",
    {
      title: "Page network log",
      description: "The page's captured HTTP requests/responses AND WebSocket frames (opens, sent/received, closes).",
      inputSchema: {
        kind: z
          .enum(["request", "response", "wsopen", "wsframe-sent", "wsframe-recv", "wsclose"])
          .optional(),
        limit: z.number().optional().describe("default 50"),
      },
    },
    async (args) => text(b.browserNetwork(session, args)),
  );

  server.registerTool(
    "browser_console",
    {
      title: "Page console",
      description: "Recent console messages from the page.",
      inputSchema: { limit: z.number().optional() },
    },
    async (args) => text(b.browserConsole(session, args)),
  );

  server.registerTool(
    "browser_capture_auth",
    {
      title: "Capture login → all planes",
      description:
        "After logging in via the browser, capture cookies (and optionally a localStorage token) and propagate them to http_request and ws_connect — one login authenticates all three planes.",
      inputSchema: {
        id: idArg,
        localStorageKey: z.string().optional().describe("localStorage key holding a token, e.g. access_token"),
        asHeader: z.string().optional().describe("header name for the token (default: Authorization as Bearer)"),
      },
    },
    async (args) => text(await b.browserCaptureAuth(session, args)),
  );

  server.registerTool(
    "browser_trace",
    {
      title: "Record Playwright trace",
      description:
        "Start or stop a Playwright trace (screenshots + DOM snapshots + network + sources) of the browser session. `stop` saves a .zip you open with `npx playwright show-trace <file>` to time-travel through the run. Auto-starts when MCP_BROWSER_TRACE is set, and is auto-saved on browser_close. The saved path is also listed in the markdown report.",
      inputSchema: {
        action: z.enum(["start", "stop"]),
        path: z.string().optional().describe("output .zip path for stop (default browser-trace-ddmmyy.zip in cwd)"),
      },
    },
    async (args) => text(await b.browserTrace(session, args)),
  );

  server.registerTool(
    "browser_close",
    {
      title: "Close browser",
      description: "Close one page (by id) or the whole browser (all: true).",
      inputSchema: { id: idArg, all: z.boolean().optional() },
    },
    async (args) => text(await b.browserClose(session, args)),
  );
}
