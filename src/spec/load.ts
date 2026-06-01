import SwaggerParser from "@apidevtools/swagger-parser";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import type { LoadedSpec } from "../session.js";
import { indexSpecForValidation } from "./validate.js";

const DISCOVERY_PATHS = [
  "/openapi.json",
  "/openapi.yaml",
  "/swagger.json",
  "/v3/api-docs",
  "/api-docs",
  "/.well-known/openapi.json",
];

function looksLikeSpecFile(s: string): boolean {
  return /\.(json|ya?ml)(\?|$)/i.test(s) || /\/(openapi|swagger|api-docs|v3\/api-docs)/i.test(s);
}

function candidateSources(source: string): string[] {
  const isUrl = /^https?:\/\//i.test(source);
  if (!isUrl) return [source]; // local file path
  if (looksLikeSpecFile(source)) return [source];
  const base = source.replace(/\/+$/, "");
  return DISCOVERY_PATHS.map((p) => base + p);
}

function detectKind(doc: any): "openapi" | "asyncapi" {
  return doc?.asyncapi ? "asyncapi" : "openapi";
}

function deriveBaseUrl(doc: any, specSource: string, override?: string): string | undefined {
  if (override) return override;
  const server = doc?.servers?.[0]?.url;
  if (!server) {
    // Fall back to the spec's own origin for discovered specs.
    try {
      const u = new URL(specSource);
      return `${u.protocol}//${u.host}`;
    } catch {
      return undefined;
    }
  }
  if (/^https?:\/\//i.test(server)) return server;
  // Relative server URL — resolve against the spec source origin.
  try {
    return new URL(server, specSource).toString();
  } catch {
    return server;
  }
}

export async function loadSpec(source: string, baseUrlOverride?: string): Promise<LoadedSpec> {
  let lastErr: unknown;
  for (const candidate of candidateSources(source)) {
    try {
      // Parse generically first (swagger-parser rejects non-OpenAPI roots, even in parse).
      const parsed: any = await $RefParser.parse(candidate);
      const kind = detectKind(parsed);

      // OpenAPI goes through swagger-parser (handles circular refs, merged params);
      // AsyncAPI/other goes through the generic ref parser.
      let bundled: any;
      let deref: any;
      if (kind === "openapi") {
        bundled = await SwaggerParser.bundle(structuredClone(parsed));
        deref = await SwaggerParser.dereference(structuredClone(parsed));
      } else {
        bundled = await $RefParser.bundle(structuredClone(parsed));
        deref = await $RefParser.dereference(structuredClone(parsed));
      }

      const validationId = indexSpecForValidation(bundled);
      return {
        source: candidate,
        kind,
        title: parsed?.info?.title,
        version: parsed?.info?.version,
        baseUrl: deriveBaseUrl(parsed, candidate, baseUrlOverride),
        bundled,
        deref,
        validationId,
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `Could not load a spec from "${source}". Last error: ${(lastErr as Error)?.message ?? lastErr}`,
  );
}
