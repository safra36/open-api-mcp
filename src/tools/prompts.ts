import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "api_test",
    {
      title: "Test an API end-to-end",
      description: "Drive a full integration test of a running API and produce a report.",
      argsSchema: {
        base_url: z.string().describe("base URL where the app is running, e.g. http://localhost:3000"),
        report_path: z.string().optional().describe("where to write the JUnit report (default ./api-report.xml)"),
      },
    },
    ({ base_url, report_path }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Integration-test the API running at ${base_url} and write a report.`,
              "",
              `1. load_spec("${base_url}") to auto-discover a served OpenAPI/AsyncAPI spec.`,
              "2. If no spec is found, review THIS project's source code (routes, controllers/handlers,",
              "   request/response models), build an OpenAPI 3 spec covering every endpoint, and register it",
              `   with synthesize_spec({ spec, baseUrl: "${base_url}" }) — kept in memory, no file written.`,
              "3. Read app://manifest. For each operation: http_request (happy path + key error cases),",
              "   then http_validate_last and assert on status and body shape.",
              "4. Set up auth with auth_set or oauth_token as needed; test documented WebSocket channels",
              "   with ws_connect + ws_expect.",
              `5. export_report junit to ${report_path ?? "./api-report.xml"} and export_report json.`,
              "   Summarise failures and any schema drift you found.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
