import type { LoadedSpec } from "../session.js";
import { validateAgainst } from "./validate.js";

interface MessageSchema {
  name?: string;
  schema: any;
}

/** Collect candidate message payload schemas for a channel (AsyncAPI 2.x and 3.x shapes). */
function collectSchemas(
  spec: LoadedSpec,
  channel: string,
  direction?: "publish" | "subscribe",
  messageName?: string,
): MessageSchema[] {
  const ch = spec.deref?.channels?.[channel];
  if (!ch) return [];
  const out: MessageSchema[] = [];

  // AsyncAPI 2.x: channels.<ch>.{publish,subscribe}.message(.oneOf[])
  for (const dir of ["publish", "subscribe"] as const) {
    if (direction && dir !== direction) continue;
    const msg = ch[dir]?.message;
    if (!msg) continue;
    const msgs = Array.isArray(msg.oneOf) ? msg.oneOf : [msg];
    for (const m of msgs) {
      if (m?.payload) out.push({ name: m.name ?? m["x-name"], schema: m.payload });
    }
  }

  // AsyncAPI 3.x: channels.<ch>.messages.<name>.payload
  if (ch.messages && typeof ch.messages === "object") {
    for (const [name, m] of Object.entries<any>(ch.messages)) {
      if (m?.payload) out.push({ name, schema: m.payload });
    }
  }

  return messageName ? out.filter((m) => m.name === messageName) : out;
}

export interface FrameValidation {
  valid: boolean;
  message?: string;
  candidates: number;
  errors?: string[];
  reason?: string;
}

/** Validate a received WS frame against a channel's documented message schema(s). */
export function validateFrame(
  spec: LoadedSpec | undefined,
  channel: string,
  frameData: string,
  opts: { direction?: "publish" | "subscribe"; messageName?: string } = {},
): FrameValidation {
  if (!spec) return { valid: false, candidates: 0, reason: "no spec loaded" };
  if (spec.kind !== "asyncapi") return { valid: false, candidates: 0, reason: "loaded spec is not AsyncAPI" };

  const schemas = collectSchemas(spec, channel, opts.direction, opts.messageName);
  if (schemas.length === 0)
    return { valid: false, candidates: 0, reason: `no message schema for channel "${channel}"` };

  let parsed: unknown = frameData;
  try {
    parsed = JSON.parse(frameData);
  } catch {
    /* validate as raw string */
  }

  const allErrors: string[] = [];
  for (const { name, schema } of schemas) {
    const res = validateAgainst(schema, parsed);
    if (res.valid) return { valid: true, message: name, candidates: schemas.length };
    allErrors.push(`${name ?? "message"}: ${res.errors.join("; ")}`);
  }
  return { valid: false, candidates: schemas.length, errors: allErrors };
}

export function channelSummaries(spec: LoadedSpec): any[] {
  const channels = spec.deref?.channels ?? {};
  return Object.entries<any>(channels).map(([name]) => ({
    name,
    messages: collectSchemas(spec, name).map((m) => m.name).filter(Boolean),
  }));
}
