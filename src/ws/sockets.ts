import WebSocket from "ws";
import { INSECURE_TLS, preferIpv4Loopback } from "../tls.js";
import { cookieHeader } from "../util.js";
import type { Session, WsSocketEntry, SocketFrame } from "../session.js";
import { validateFrame } from "../spec/asyncapi.js";
import { deliver, receive } from "./inbox.js";

export function wsConnect(
  session: Session,
  args: { url: string; id?: string; headers?: Record<string, string> },
): Promise<unknown> {
  const id = args.id ?? `ws${session.sockets.size + 1}`;
  if (session.sockets.get(id)?.open) throw new Error(`socket id "${id}" is already open`);

  const headers: Record<string, string> = { ...session.auth.headers, ...(args.headers ?? {}) };
  const cookie = cookieHeader(session.auth.cookies);
  if (cookie && !headers["Cookie"]) headers["Cookie"] = cookie;

  const url = preferIpv4Loopback(new URL(args.url)).toString();
  const ws = new WebSocket(url, { headers, ...(INSECURE_TLS ? { rejectUnauthorized: false } : {}) });
  const entry: WsSocketEntry = {
    kind: "ws",
    id,
    url: args.url,
    ws,
    open: false,
    frames: [],
    inbox: [],
    waiters: [],
  };
  session.sockets.set(id, entry);

  ws.on("message", (data, isBinary) => {
    deliver(entry, {
      at: Date.now(),
      dir: "in",
      data: isBinary ? `<binary ${(data as Buffer).length}b>` : data.toString(),
    });
  });
  ws.on("close", (code, reason) => {
    entry.open = false;
    entry.closeInfo = { code, reason: reason.toString() };
  });

  return new Promise((resolve, reject) => {
    ws.once("open", () => {
      entry.open = true;
      resolve({ id, url: args.url, open: true });
    });
    ws.once("error", (err) => {
      session.sockets.delete(id);
      reject(new Error(`ws connect failed: ${err.message}`));
    });
  });
}

function getOpen(session: Session, id: string): WsSocketEntry {
  const entry = session.sockets.get(id);
  if (!entry) throw new Error(`no socket with id "${id}"`);
  if (entry.kind !== "ws")
    throw new Error(`socket "${id}" is a Socket.IO connection — use the sio_* tools`);
  return entry;
}

export function wsSend(session: Session, args: { id: string; data: unknown; json?: boolean }): unknown {
  const entry = getOpen(session, args.id);
  if (!entry.open) throw new Error(`socket "${args.id}" is not open`);
  const payload =
    args.json || typeof args.data !== "string" ? JSON.stringify(args.data) : (args.data as string);
  entry.ws.send(payload);
  entry.frames.push({ at: Date.now(), dir: "out", data: payload });
  return { id: args.id, sent: payload };
}

export function wsRecv(
  session: Session,
  args: { id: string; timeoutMs?: number; match?: string },
): Promise<unknown> {
  const entry = getOpen(session, args.id);
  const re = args.match ? new RegExp(args.match) : undefined;
  const matches = (f: SocketFrame) => !re || re.test(f.data);
  return receive(entry, matches, args.timeoutMs ?? 5000).then((r) => ({ id: args.id, ...r }));
}

export async function wsExpect(
  session: Session,
  args: { id: string; channel: string; timeoutMs?: number; match?: string; message?: string; direction?: "publish" | "subscribe" },
): Promise<unknown> {
  const recv = (await wsRecv(session, { id: args.id, timeoutMs: args.timeoutMs, match: args.match })) as any;
  if (!recv.frame) {
    const result = { name: `ws_expect ${args.channel}`, ok: false, detail: recv.timedOut ? "timed out waiting for frame" : "socket closed", at: Date.now() };
    session.results.push(result);
    return { ...recv, validation: null, assert: result };
  }
  const validation = validateFrame(session.spec, args.channel, recv.frame.data, {
    direction: args.direction,
    messageName: args.message,
  });
  const result = {
    name: `ws_expect ${args.channel}${args.message ? `#${args.message}` : ""}`,
    ok: validation.valid,
    detail: validation.valid ? `matched ${validation.message ?? "message"}` : (validation.errors?.join(" | ") ?? validation.reason ?? "no match"),
    at: Date.now(),
  };
  session.results.push(result);
  return { frame: recv.frame, validation, assert: result };
}

export function wsClose(session: Session, args: { id: string; code?: number; reason?: string }): unknown {
  const entry = getOpen(session, args.id);
  entry.ws.close(args.code ?? 1000, args.reason);
  return { id: args.id, closing: true };
}
