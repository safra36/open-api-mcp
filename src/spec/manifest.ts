import type { LoadedSpec, Session } from "../session.js";
import { channelSummaries } from "./asyncapi.js";

const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "head", "options"];

interface ManifestOp {
  operationId?: string;
  method: string;
  path: string;
  summary?: string;
  params: { name: string; in: string; required: boolean }[];
  requestBody?: string[]; // content types
}

function buildOps(spec: LoadedSpec): ManifestOp[] {
  const ops: ManifestOp[] = [];
  const paths = spec.deref?.paths ?? {};
  for (const [path, item] of Object.entries<any>(paths)) {
    const shared = item?.parameters ?? [];
    for (const method of HTTP_METHODS) {
      const op = item?.[method];
      if (!op) continue;
      const params = [...shared, ...(op.parameters ?? [])].map((p: any) => ({
        name: p?.name,
        in: p?.in,
        required: !!p?.required,
      }));
      ops.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path,
        summary: op.summary ?? op.description,
        params,
        requestBody: op.requestBody?.content ? Object.keys(op.requestBody.content) : undefined,
      });
    }
  }
  return ops;
}

function buildAuth(spec: LoadedSpec): any[] {
  const schemes = spec.deref?.components?.securitySchemes ?? {};
  return Object.entries<any>(schemes).map(([name, s]) => ({
    name,
    type: s?.type,
    scheme: s?.scheme,
    in: s?.in,
    bearerFormat: s?.bearerFormat,
  }));
}

function buildChannels(spec: LoadedSpec): any[] {
  if (spec.kind !== "asyncapi") return [];
  return channelSummaries(spec);
}

/** Compact "here's what you can do" view the agent reads from app://manifest. */
export function buildManifest(session: Session): unknown {
  if (!session.spec) {
    return { loaded: false, hint: "call load_spec(source) with an OpenAPI/AsyncAPI URL or file path" };
  }
  const spec = session.spec;
  return {
    loaded: true,
    kind: spec.kind,
    title: spec.title,
    version: spec.version,
    baseUrl: spec.baseUrl,
    source: spec.source,
    auth: buildAuth(spec),
    operations: spec.kind === "openapi" ? buildOps(spec) : [],
    channels: buildChannels(spec),
  };
}
