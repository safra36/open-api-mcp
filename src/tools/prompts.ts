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
              "5. Finish with export_report({ format: \"markdown\" }) — it writes the full detailed final report",
              "   (contract, every request/response, WS frames, browser activity, assertions) to test-report-ddmmyy.md.",
              `   ${report_path ? `Also export_report junit to ${report_path}.` : "Add junit/json exports if the user wants CI artifacts."}`,
              "   Summarise failures and any schema drift you found.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "jest_suite",
    {
      title: "Generate a Jest test suite for an API",
      description:
        "Run a live session, then write a dedicated Jest test folder (unit + contract + replay). E2E is left to the agent.",
      argsSchema: {
        base_url: z.string().describe("base URL where the app is running, e.g. http://localhost:3000"),
        test_dir: z.string().optional().describe("where to write the suite (default ./test)"),
      },
    },
    ({ base_url, test_dir }) => {
      const dir = test_dir ?? "./test";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Build a Jest test suite for the API at ${base_url}, grounded in real behaviour.`,
                "",
                "First drive a live session so the suite reflects what the API actually does:",
                `1. load_spec("${base_url}"); if none is served, read this project's routes/handlers/models,`,
                `   build an OpenAPI 3 spec, and register it with synthesize_spec({ spec, baseUrl: "${base_url}" }).`,
                "2. Read app://manifest. For each operation run http_request (happy path + key error cases),",
                "   then http_validate_last and assert on status and body shape.",
                "",
                `Then author the suite under ${dir}:`,
                "3. Detect the project's conventions first — TS vs JS, ESM vs CJS, any existing jest config and",
                "   test script. Match them. Only add jest/ts-jest or a config when missing, and ask before",
                "   installing any dependency.",
                `4. export_report({ format: "jest", path: "${dir}/contract.replay.test.js" }) to emit the`,
                "   deterministic replay layer from the requests you actually ran.",
                "5. Around it, add the other layers: unit tests for pure helpers/validators you find in the",
                "   source, and contract tests that assert responses against the spec schemas. Keep each file",
                "   small and grouped by concern.",
                "6. Do NOT write end-to-end tests — those are handled separately.",
                "7. Run the suite (npm test / npx jest) and fix what you generated until it passes; report the",
                "   final test counts and anything you stubbed or skipped.",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
