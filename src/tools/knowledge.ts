import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Session } from "../session.js";
import { applyAuth } from "../auth.js";
import { isAutoDiscovery, loadSpec, loadSpecFromObject } from "../spec/load.js";
import { buildManifest } from "../spec/manifest.js";
import { text } from "../util.js";

function specSummary(spec: { kind: string; title?: string; version?: string; baseUrl?: string; source: string; deref?: any }) {
  return {
    loaded: true,
    kind: spec.kind,
    title: spec.title,
    version: spec.version,
    baseUrl: spec.baseUrl,
    source: spec.source,
    paths: Object.keys(spec.deref?.paths ?? {}).length,
    channels: Object.keys(spec.deref?.channels ?? {}).length,
    next: "read app://manifest to see operations, then call http_request",
  };
}

export function registerKnowledge(server: McpServer, session: Session): void {
  server.registerTool(
    "load_spec",
    {
      title: "Load API spec",
      description:
        "Load an OpenAPI (or AsyncAPI) document from a file path, a full spec URL, or a base URL to auto-discover (/openapi.json, /swagger.json, /v3/api-docs, …). $refs are resolved. Populates app://manifest and app://contract.",
      inputSchema: {
        source: z.string().describe("file path, full spec URL, or base URL for auto-discovery"),
        baseUrl: z.string().optional().describe("override the API base URL used for http_request"),
      },
    },
    async ({ source, baseUrl }) => {
      try {
        session.spec = await loadSpec(source, baseUrl);
      } catch (e) {
        // Auto-discovery miss: guide the agent to synthesise a spec from the source code
        // instead of failing, so testing can still proceed with full validation.
        if (isAutoDiscovery(source)) {
          return text({
            loaded: false,
            discovered: false,
            baseUrl: baseUrl ?? source,
            action: "NO_SPEC_FOUND — synthesise one from the source code",
            do: [
              "Review this project's source (routes, controllers/handlers, request/response models).",
              "Build an OpenAPI 3 document covering every endpoint and its response schemas.",
              "Prefer synthesize_spec({ spec, baseUrl }) to register it in memory (no file written to the target project).",
              "Or, if you want it persisted, write ./api-spec.json and call load_spec on that file.",
              "Then read app://manifest and begin testing with http_request + http_validate_last + assert.",
            ],
            note: "You can also test freeform without a spec (http_request with absolute url), but you lose schema-drift validation.",
            detail: (e as Error).message,
          });
        }
        throw e;
      }
      return text(specSummary(session.spec));
    },
  );

  server.registerTool(
    "synthesize_spec",
    {
      title: "Register a synthesised spec",
      description:
        "Register an OpenAPI 3 / AsyncAPI document you built from reading the source code — held in memory, no file written to the target project. Use this when load_spec returns NO_SPEC_FOUND. Then read app://manifest and start testing.",
      inputSchema: {
        spec: z.any().describe("the spec as a JSON object (or a JSON string)"),
        baseUrl: z.string().optional().describe("base URL of the running app to test against"),
      },
    },
    async ({ spec, baseUrl }) => {
      const doc = typeof spec === "string" ? JSON.parse(spec) : spec;
      session.spec = await loadSpecFromObject(doc, baseUrl);
      return text(specSummary(session.spec));
    },
  );

  server.registerTool(
    "set_target",
    {
      title: "Set target",
      description:
        "Prime the session up front so you aren't prompted later: set the base URL and (optionally) an auth token in one call.",
      inputSchema: {
        baseUrl: z.string().describe("base URL of the running app, e.g. http://localhost:3000"),
        bearerToken: z.string().optional().describe("sets Authorization: Bearer <token>"),
        apiKeyHeader: z.string().optional().describe("header name for an API key, e.g. X-API-Key"),
        apiKeyValue: z.string().optional().describe("value for apiKeyHeader"),
      },
    },
    async ({ baseUrl, bearerToken, apiKeyHeader, apiKeyValue }) => {
      session.baseUrl = baseUrl;
      if (session.spec) session.spec.baseUrl = baseUrl;
      const applied: string[] = [];
      if (bearerToken) applied.push(applyAuth(session, { type: "bearer", token: bearerToken }));
      if (apiKeyHeader && apiKeyValue !== undefined)
        applied.push(applyAuth(session, { type: "header", headerName: apiKeyHeader, value: apiKeyValue }));
      return text({ ok: true, baseUrl, auth: applied });
    },
  );

  server.registerResource(
    "manifest",
    "app://manifest",
    {
      title: "Capability manifest",
      description: "Compact view of what you can do: base URL, operations, auth schemes, channels.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(buildManifest(session), null, 2) }],
    }),
  );

  server.registerResource(
    "contract",
    "app://contract",
    {
      title: "Full contract",
      description: "The bundled (dereferenced) OpenAPI/AsyncAPI document.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: session.spec ? JSON.stringify(session.spec.bundled, null, 2) : JSON.stringify({ loaded: false }),
        },
      ],
    }),
  );

  server.registerResource(
    "session",
    "app://session",
    {
      title: "Live session state",
      description: "Current auth, open sockets, browser pages, and the last HTTP response.",
      mimeType: "application/json",
    },
    async (uri) => {
      const lr = session.lastResponse;
      const state = {
        specLoaded: !!session.spec,
        baseUrl: session.spec?.baseUrl ?? session.baseUrl,
        auth: {
          headers: Object.keys(session.auth.headers),
          cookies: Object.keys(session.auth.cookies),
        },
        sockets: [...session.sockets.values()].map((s) => ({ id: s.id, kind: s.kind, url: s.url, open: s.open, frames: s.frames.length })),
        browserPages: [...session.pages.keys()],
        lastResponse: lr
          ? { method: lr.method, url: lr.url, status: lr.status, operationId: lr.operationId, matchedPath: lr.matchedPath }
          : null,
      };
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(state, null, 2) }] };
    },
  );
}
