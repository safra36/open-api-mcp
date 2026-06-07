import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runAssert } from "../assert.js";
import { buildReport, exportReport } from "../report.js";
import type { Session } from "../session.js";
import { text } from "../util.js";

export function registerReport(server: McpServer, session: Session): void {
  server.registerTool(
    "assert",
    {
      title: "Assert",
      description:
        "Assert a condition about the last HTTP response and record the result for export_report. Combine any of: status, bodyContains, jsonPointer+equals, schemaValid, or a JS expression (with `res` and `body` in scope).",
      inputSchema: {
        name: z.string().describe("a label for this check"),
        status: z.number().optional(),
        bodyContains: z.string().optional(),
        jsonPointer: z.string().optional().describe("JSON pointer into the response body, e.g. /data/0/id"),
        equals: z.any().optional().describe("value the jsonPointer must equal"),
        schemaValid: z.boolean().optional().describe("assert the response matches the spec schema"),
        expression: z.string().optional().describe("JS expression, truthy = pass, e.g. body.total > 0"),
      },
    },
    async (args) => text(runAssert(session, args)),
  );

  server.registerTool(
    "export_report",
    {
      title: "Export report",
      description:
        "Export the session's results. Formats: `markdown` — the full, human-readable final report covering every plane (contract/oracle, assertions, each HTTP request+response with headers and bodies, WebSocket frames, browser network & console, session context); `junit` XML; `har`; `json`; or a runnable `jest` suite that replays the executed requests. Writes to `path` if given. `markdown` always writes a file, defaulting to `test-report-ddmmyy.md` in the working directory; other formats return inline when no `path` is given. Secrets are redacted; the Jest output reads auth from API_AUTH/API_KEY/API_COOKIE env vars.",
      inputSchema: {
        format: z.enum(["markdown", "junit", "har", "json", "jest"]),
        path: z.string().optional().describe("file path to write to (markdown defaults to ./test-report-ddmmyy.md)"),
      },
    },
    async (args) => text(await exportReport(session, args)),
  );

  server.registerResource(
    "report",
    "app://report",
    {
      title: "Live report",
      description: "Running tally of assertions and requests this session.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(buildReport(session), null, 2) }],
    }),
  );
}
