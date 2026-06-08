import type { SocketFrame } from "../session.js";

/** The mutable receive-side of a socket entry (raw WS or Socket.IO) — the part the
 * inbox/waiter machinery touches. Both transports satisfy this structurally. */
export interface Inbox {
  open: boolean;
  frames: SocketFrame[];
  inbox: SocketFrame[]; // inbound frames not yet consumed by a recv call
  waiters: Array<(f: SocketFrame) => void>;
  closeInfo?: { code: number; reason: string };
}

/** Record an inbound frame: append to history, then hand it to a queued waiter or buffer it. */
export function deliver(q: Inbox, frame: SocketFrame): void {
  q.frames.push(frame);
  const waiter = q.waiters.shift();
  if (waiter) waiter(frame);
  else q.inbox.push(frame);
}

export interface RecvResult {
  frame: SocketFrame | null;
  timedOut?: boolean;
  closed?: { code: number; reason: string };
}

/** Wait for the next buffered/inbound frame satisfying `matches`, or time out.
 * Non-matching frames are kept buffered for a later recv. */
export function receive(
  q: Inbox,
  matches: (f: SocketFrame) => boolean,
  timeoutMs: number,
): Promise<RecvResult> {
  const buffered = q.inbox.findIndex(matches);
  if (buffered >= 0) {
    const [frame] = q.inbox.splice(buffered, 1);
    return Promise.resolve({ frame });
  }
  if (!q.open) return Promise.resolve({ frame: null, closed: q.closeInfo });

  return new Promise((resolve) => {
    let done = false;
    const waiter = (f: SocketFrame) => {
      if (done) return;
      if (!matches(f)) {
        q.inbox.push(f); // not what we wanted — keep it for later
        q.waiters.push(waiter);
        return;
      }
      done = true;
      clearTimeout(timer);
      resolve({ frame: f });
    };
    const timer = setTimeout(() => {
      done = true;
      const i = q.waiters.indexOf(waiter);
      if (i >= 0) q.waiters.splice(i, 1);
      resolve({ frame: null, timedOut: true });
    }, timeoutMs);
    q.waiters.push(waiter);
  });
}
