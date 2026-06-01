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

/** True when `source` is a base URL we'd auto-discover against (not a direct spec file/URL). */
export function isAutoDiscovery(source: string): boolean {
  return /^https?:\/\//i.test(source) && !looksLikeSpecFile(source);
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

async function buildLoadedSpec(parsed: any, sourceLabel: string, baseUrlOverride?: string): Promise<LoadedSpec> {
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

  return {
    source: sourceLabel,
    kind,
    title: parsed?.info?.title,
    version: parsed?.info?.version,
    baseUrl: deriveBaseUrl(parsed, sourceLabel, baseUrlOverride),
    bundled,
    deref,
    validationId: indexSpecForValidation(bundled),
  };
}

export async function loadSpec(source: string, baseUrlOverride?: string): Promise<LoadedSpec> {
  let lastErr: unknown;
  for (const candidate of candidateSources(source)) {
    try {
      // Parse generically first (swagger-parser rejects non-OpenAPI roots, even in parse).
      const parsed: any = await $RefParser.parse(candidate);
      return await buildLoadedSpec(parsed, candidate, baseUrlOverride);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `Could not load a spec from "${source}". Last error: ${(lastErr as Error)?.message ?? lastErr}`,
  );
}

/** Register an in-memory spec object (e.g. one the agent synthesised from source code). */
export async function loadSpecFromObject(doc: unknown, baseUrlOverride?: string): Promise<LoadedSpec> {
  if (!doc || typeof doc !== "object") throw new Error("synthesize_spec expects a spec object (OpenAPI 3 / AsyncAPI)");
  if (!(doc as any).openapi && !(doc as any).swagger && !(doc as any).asyncapi)
    throw new Error('spec must have an "openapi", "swagger", or "asyncapi" version field');
  return buildLoadedSpec(doc, "synthesized (in-memory)", baseUrlOverride);
}
