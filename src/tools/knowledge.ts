import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Session } from "../session.js";
import { loadSpec } from "../spec/load.js";
import { buildManifest } from "../spec/manifest.js";
import { text } from "../util.js";

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
      session.spec = await loadSpec(source, baseUrl);
      const { spec } = session;
      const opCount = Object.keys(spec.deref?.paths ?? {}).length;
      return text({
        loaded: true,
        kind: spec.kind,
        title: spec.title,
        version: spec.version,
        baseUrl: spec.baseUrl,
        source: spec.source,
        paths: opCount,
        next: "read app://manifest to see operations, then call http_request",
      });
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
        baseUrl: session.spec?.baseUrl,
        auth: {
          headers: Object.keys(session.auth.headers),
          cookies: Object.keys(session.auth.cookies),
        },
        sockets: [...session.sockets.values()].map((s) => ({ id: s.id, url: s.url, open: s.open, frames: s.frames.length })),
        browserPages: [...session.pages.keys()],
        lastResponse: lr
          ? { method: lr.method, url: lr.url, status: lr.status, operationId: lr.operationId, matchedPath: lr.matchedPath }
          : null,
      };
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(state, null, 2) }] };
    },
  );
}
