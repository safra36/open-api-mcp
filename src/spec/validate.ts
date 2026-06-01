import AjvImport from "ajv";
import addFormatsImport from "ajv-formats";
import type { LastResponse, LoadedSpec } from "../session.js";

// ajv/ajv-formats ship CJS; normalise the interop default across module settings.
const Ajv: any = (AjvImport as any).default ?? AjvImport;
const addFormats: any = (addFormatsImport as any).default ?? addFormatsImport;

const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: true });
addFormats(ajv);

let specCounter = 0;

/** Register a bundled spec document so its internal $refs resolve during validation. */
export function indexSpecForValidation(bundled: unknown): string {
  const id = `spec-${++specCounter}.json`;
  ajv.addSchema(bundled as object, id);
  return id;
}

const compiledCache = new WeakMap<object, any>();

/** Validate arbitrary data against a (dereferenced) JSON schema object. */
export function validateAgainst(schema: any, data: unknown): { valid: boolean; errors: string[] } {
  let v = compiledCache.get(schema);
  if (!v) {
    try {
      v = ajv.compile(schema);
    } catch (e) {
      return { valid: false, errors: [`schema compile error: ${(e as Error).message}`] };
    }
    compiledCache.set(schema, v);
  }
  const valid = v(data) as boolean;
  return {
    valid,
    errors: valid ? [] : (v.errors ?? []).map((e: any) => `${e.instancePath || "(root)"} ${e.message ?? ""}`.trim()),
  };
}

function jsonPointer(...segments: string[]): string {
  return "/" + segments.map((s) => s.replace(/~/g, "~0").replace(/\//g, "~1")).join("/");
}

function pickResponseKey(responses: Record<string, unknown>, status: number): string | undefined {
  if (responses[String(status)]) return String(status);
  const wildcard = `${String(status)[0]}XX`;
  if (responses[wildcard]) return wildcard;
  if (responses.default) return "default";
  return undefined;
}

export interface ValidationResult {
  matched: boolean;
  validated: boolean;
  valid?: boolean;
  status?: number;
  path?: string;
  contentType?: string;
  errors?: string[];
  reason?: string;
}

export function validateLast(spec: LoadedSpec | undefined, lr: LastResponse | undefined): ValidationResult {
  if (!spec) return { matched: false, validated: false, reason: "no spec loaded" };
  if (!lr) return { matched: false, validated: false, reason: "no response captured yet" };
  if (!lr.matchedPath) return { matched: false, validated: false, reason: "response did not map to a spec path" };

  const op = spec.deref?.paths?.[lr.matchedPath]?.[lr.method.toLowerCase()];
  if (!op) return { matched: true, validated: false, reason: "no operation for this method" };

  const responses = op.responses ?? {};
  const respKey = pickResponseKey(responses, lr.status);
  if (!respKey)
    return { matched: true, validated: false, status: lr.status, path: lr.matchedPath, reason: `no documented response for status ${lr.status}` };

  const content = responses[respKey]?.content ?? {};
  const ctKey = content["application/json"] ? "application/json" : Object.keys(content)[0];
  if (!ctKey || !content[ctKey]?.schema)
    return { matched: true, validated: false, status: lr.status, path: lr.matchedPath, reason: "no response schema documented" };

  const ref =
    `${spec.validationId}#` +
    jsonPointer("paths", lr.matchedPath, lr.method.toLowerCase(), "responses", respKey, "content", ctKey, "schema");

  let validate;
  try {
    validate = ajv.getSchema(ref);
  } catch (e) {
    return { matched: true, validated: false, status: lr.status, path: lr.matchedPath, reason: `schema compile error: ${(e as Error).message}` };
  }
  if (!validate)
    return { matched: true, validated: false, status: lr.status, path: lr.matchedPath, reason: "could not resolve response schema" };

  const valid = validate(lr.body) as boolean;
  const errors = valid
    ? []
    : (validate.errors ?? []).map((e: any) => `${e.instancePath || "(root)"} ${e.message ?? ""}`.trim());

  return { matched: true, validated: true, valid, status: lr.status, path: lr.matchedPath, contentType: ctKey, errors };
}
