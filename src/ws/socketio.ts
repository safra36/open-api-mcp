import { io, type Socket as IOSocket } from "socket.io-client";
import { INSECURE_TLS, preferIpv4Loopback } from "../tls.js";
import { cookieHeader } from "../util.js";
import type { Session, SioSocketEntry, SocketFrame } from "../session.js";
import { validateFrame } from "../spec/asyncapi.js";
import { deliver, receive } from "./inbox.js";

/** Stringify Socket.IO event args for history/matching. A single arg is unwrapped so the
 * stored frame data mirrors the payload (and validates cleanly against a message schema). */
function encodeArgs(args: unknown[]): string {
  const payload = args.length === 1 ? args[0] : args;
  return typeof payload === "string" ? payload : JSON.stringify(payload);
}

export function sioConnect(
  session: Session,
  args: {
    url: string;
    id?: string;
    namespace?: string;
    auth?: Record<string, unknown>;
    headers?: Record<string, string>;
    path?: string;
  },
): Promise<unknown> {
  const id = args.id ?? `sio${session.sockets.size + 1}`;
  if (session.sockets.get(id)?.open) throw new Error(`socket id "${id}" is already open`);

  const extraHeaders: Record<string, string> = { ...session.auth.headers, ...(args.headers ?? {}) };
  const cookie = cookieHeader(session.auth.cookies);
  if (cookie && !extraHeaders["Cookie"]) extraHeaders["Cookie"] = cookie;

  // Fold a bearer token from session auth into the Socket.IO handshake `auth` payload, where
  // servers using socket.io middleware typically read it (handshake.auth.token).
  const bearer = session.auth.headers["Authorization"]?.replace(/^Bearer\s+/i, "");
  const auth: Record<string, unknown> = { ...(bearer ? { token: bearer } : {}), ...(args.auth ?? {}) };

  // Socket.IO's namespace is the URL path; the engine.io mount point is `path` (default /socket.io).
  const base = preferIpv4Loopback(new URL(args.url));
  const namespace = args.namespace ?? (base.pathname && base.pathname !== "/" ? base.pathname : "/");
  const origin = base.origin;

  const sio = io(origin + (namespace === "/" ? "" : namespace), {
    transports: ["websocket"],
    extraHeaders,
    auth,
    ...(args.path ? { path: args.path } : {}),
    ...(INSECURE_TLS ? { rejectUnauthorized: false } : {}),
    reconnection: false,
    autoConnect: true,
  });

  const entry: SioSocketEntry = {
    kind: "socketio",
    id,
    url: args.url,
    sio,
    namespace,
    open: false,
    frames: [],
    inbox: [],
    waiters: [],
  };
  session.sockets.set(id, entry);

  // Capture every inbound event (name + payload) as a frame.
  sio.onAny((event: string, ...payload: unknown[]) => {
    deliver(entry, { at: Date.now(), dir: "in", event, data: encodeArgs(payload) });
  });
  sio.on("disconnect", (reason: string) => {
    entry.open = false;
    entry.closeInfo = { code: 0, reason };
  });

  return new Promise((resolve, reject) => {
    sio.once("connect", () => {
      entry.open = true;
      resolve({ id, url: args.url, namespace, open: true });
    });
    sio.once("connect_error", (err: Error) => {
      session.sockets.delete(id);
      reject(new Error(`socket.io connect failed: ${err.message}`));
    });
  });
}

function getOpen(session: Session, id: string): SioSocketEntry {
  const entry = session.sockets.get(id);
  if (!entry) throw new Error(`no socket with id "${id}"`);
  if (entry.kind !== "socketio")
    throw new Error(`socket "${id}" is a raw WebSocket — use the ws_* tools`);
  return entry;
}

export function sioEmit(
  session: Session,
  args: { id: string; event: string; args?: unknown; ack?: boolean; ackTimeoutMs?: number },
): Promise<unknown> {
  const entry = getOpen(session, args.id);
  if (!entry.open) throw new Error(`socket "${args.id}" is not open`);

  const payload = args.args === undefined ? [] : Array.isArray(args.args) ? args.args : [args.args];
  entry.frames.push({ at: Date.now(), dir: "out", event: args.event, data: encodeArgs(payload), ack: args.ack });

  if (!args.ack) {
    entry.sio.emit(args.event, ...payload);
    return Promise.resolve({ id: args.id, event: args.event, emitted: payload });
  }

  const timeoutMs = args.ackTimeoutMs ?? 5000;
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ id: args.id, event: args.event, ack: null, timedOut: true });
    }, timeoutMs);
    entry.sio.emit(args.event, ...payload, (...ackArgs: unknown[]) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const data = encodeArgs(ackArgs);
      deliver(entry, { at: Date.now(), dir: "in", event: `${args.event}:ack`, data, ack: true });
      resolve({ id: args.id, event: args.event, ack: ackArgs.length === 1 ? ackArgs[0] : ackArgs });
    });
  });
}

export function sioRecv(
  session: Session,
  args: { id: string; event?: string; timeoutMs?: number; match?: string },
): Promise<unknown> {
  const entry = getOpen(session, args.id);
  const re = args.match ? new RegExp(args.match) : undefined;
  const matches = (f: SocketFrame) =>
    (!args.event || f.event === args.event) && (!re || re.test(f.data));
  return receive(entry, matches, args.timeoutMs ?? 5000).then((r) => ({ id: args.id, ...r }));
}

export async function sioExpect(
  session: Session,
  args: {
    id: string;
    event: string;
    channel?: string;
    message?: string;
    direction?: "publish" | "subscribe";
    match?: string;
    timeoutMs?: number;
  },
): Promise<unknown> {
  const channel = args.channel ?? args.event;
  const recv = (await sioRecv(session, {
    id: args.id,
    event: args.event,
    timeoutMs: args.timeoutMs,
    match: args.match,
  })) as { frame: SocketFrame | null; timedOut?: boolean };

  if (!recv.frame) {
    const result = {
      name: `sio_expect ${args.event}`,
      ok: false,
      detail: recv.timedOut ? `timed out waiting for "${args.event}"` : "socket closed",
      at: Date.now(),
    };
    session.results.push(result);
    return { ...recv, validation: null, assert: result };
  }

  const validation = validateFrame(session.spec, channel, recv.frame.data, {
    direction: args.direction,
    messageName: args.message,
  });
  const result = {
    name: `sio_expect ${args.event}${args.message ? `#${args.message}` : ""}`,
    ok: validation.valid,
    detail: validation.valid
      ? `matched ${validation.message ?? "message"}`
      : (validation.errors?.join(" | ") ?? validation.reason ?? "no match"),
    at: Date.now(),
  };
  session.results.push(result);
  return { frame: recv.frame, validation, assert: result };
}

export function sioClose(session: Session, args: { id: string }): unknown {
  const entry = getOpen(session, args.id);
  entry.sio.close();
  entry.open = false;
  return { id: args.id, closing: true };
}
