import { type Page } from "playwright";
import type { Session } from "../session.js";
import { acquireContext, TRACE_ON } from "./pool.js";
import { ddmmyy } from "../report.js";

const NET_CAP = 1000;

const TRACE_OPTS = { screenshots: true, snapshots: true, sources: true };

function defaultTracePath(): string {
  return `browser-trace-${ddmmyy(new Date())}.zip`;
}

async function ensureContext(session: Session) {
  if (!session.context) {
    session.context = await acquireContext();
    if (TRACE_ON && !session.tracing) {
      await session.context.tracing.start(TRACE_OPTS);
      session.tracing = true;
    }
  }
  return session.context;
}

function record(session: Session, entry: Session["net"][number]) {
  session.net.push(entry);
  if (session.net.length > NET_CAP) session.net.splice(0, session.net.length - NET_CAP);
}

function attach(session: Session, page: Page) {
  page.on("request", (r) => record(session, { at: Date.now(), kind: "request", method: r.method(), url: r.url() }));
  page.on("response", (r) =>
    record(session, { at: Date.now(), kind: "response", url: r.url(), status: r.status() }),
  );
  page.on("console", (m) => {
    session.console.push({ at: Date.now(), type: m.type(), text: m.text() });
    if (session.console.length > NET_CAP) session.console.splice(0, session.console.length - NET_CAP);
  });
  page.on("websocket", (ws) => {
    record(session, { at: Date.now(), kind: "wsopen", url: ws.url() });
    ws.on("framesent", (e) =>
      record(session, { at: Date.now(), kind: "wsframe-sent", url: ws.url(), payload: String(e.payload) }),
    );
    ws.on("framereceived", (e) =>
      record(session, { at: Date.now(), kind: "wsframe-recv", url: ws.url(), payload: String(e.payload) }),
    );
    ws.on("close", () => record(session, { at: Date.now(), kind: "wsclose", url: ws.url() }));
  });
}

async function getPage(session: Session, id = "main"): Promise<Page> {
  const existing = session.pages.get(id);
  if (existing && !existing.isClosed()) return existing;
  const ctx = await ensureContext(session);
  const page = await ctx.newPage();
  attach(session, page);
  session.pages.set(id, page);
  return page;
}

export async function browserOpen(session: Session, a: { url: string; id?: string }): Promise<unknown> {
  const page = await getPage(session, a.id);
  await page.goto(a.url, { waitUntil: "domcontentloaded" });
  return { id: a.id ?? "main", url: page.url(), title: await page.title() };
}

export async function browserSnapshot(session: Session, a: { id?: string }): Promise<unknown> {
  const page = await getPage(session, a.id);
  const snapshot = await page.locator("body").ariaSnapshot();
  return { id: a.id ?? "main", url: page.url(), snapshot };
}

export async function browserAct(
  session: Session,
  a: { action: "click" | "fill" | "select" | "press" | "hover"; selector: string; value?: string; id?: string },
): Promise<unknown> {
  const page = await getPage(session, a.id);
  const loc = page.locator(a.selector).first();
  switch (a.action) {
    case "click":
      await loc.click();
      break;
    case "hover":
      await loc.hover();
      break;
    case "fill":
      await loc.fill(a.value ?? "");
      break;
    case "select":
      await loc.selectOption(a.value ?? "");
      break;
    case "press":
      await loc.press(a.value ?? "Enter");
      break;
  }
  return { id: a.id ?? "main", action: a.action, selector: a.selector, url: page.url() };
}

export async function browserEval(session: Session, a: { expression: string; id?: string }): Promise<unknown> {
  const page = await getPage(session, a.id);
  const result = await page.evaluate(a.expression);
  return { id: a.id ?? "main", result };
}

export async function browserScreenshot(
  session: Session,
  a: { id?: string; fullPage?: boolean },
): Promise<{ base64: string; mime: string }> {
  const page = await getPage(session, a.id);
  const buf = await page.screenshot({ fullPage: !!a.fullPage });
  return { base64: buf.toString("base64"), mime: "image/png" };
}

export function browserNetwork(
  session: Session,
  a: { kind?: string; limit?: number },
): unknown {
  let entries = session.net;
  if (a.kind) entries = entries.filter((e) => e.kind === a.kind);
  const limit = a.limit ?? 50;
  return { count: entries.length, entries: entries.slice(-limit) };
}

export function browserConsole(session: Session, a: { limit?: number }): unknown {
  const limit = a.limit ?? 50;
  return { count: session.console.length, entries: session.console.slice(-limit) };
}

/** Pull the browser's cookies (and optionally a localStorage token) into the HTTP/WS auth context. */
export async function browserCaptureAuth(
  session: Session,
  a: { id?: string; localStorageKey?: string; asHeader?: string },
): Promise<unknown> {
  const ctx = await ensureContext(session);
  const cookies = await ctx.cookies();
  for (const c of cookies) session.auth.cookies[c.name] = c.value;

  let token: string | null = null;
  if (a.localStorageKey) {
    const page = await getPage(session, a.id);
    token = (await page.evaluate((k) => window.localStorage.getItem(k), a.localStorageKey)) as string | null;
    if (token) {
      if (a.asHeader) session.auth.headers[a.asHeader] = token;
      else session.auth.headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return {
    capturedCookies: cookies.map((c) => c.name),
    capturedToken: token ? (a.asHeader ?? "Authorization") : null,
    note: "cookies/token now propagate to http_request and ws_connect",
  };
}

/** Start or stop a Playwright trace of the session. Stop saves a .zip viewable with
 * `npx playwright show-trace <file>` — a time-travel filmstrip of the whole run. */
export async function browserTrace(
  session: Session,
  a: { action: "start" | "stop"; path?: string },
): Promise<unknown> {
  if (a.action === "stop") {
    if (!session.tracing || !session.context) return { tracing: false, note: "no trace was recording" };
    const path = a.path ?? defaultTracePath();
    await session.context.tracing.stop({ path });
    session.tracing = false;
    session.tracePath = path;
    return { tracing: false, saved: path, note: `open with: npx playwright show-trace ${path}` };
  }
  const ctx = await ensureContext(session);
  if (session.tracing) return { tracing: true, note: "trace already recording" };
  await ctx.tracing.start(TRACE_OPTS);
  session.tracing = true;
  return { tracing: true, note: "recording — call browser_trace stop (or browser_close) to save a viewable .zip" };
}

export async function browserClose(session: Session, a: { id?: string; all?: boolean }): Promise<unknown> {
  if (a.all || !a.id) {
    // Save an in-progress trace before tearing the context down, so it's never lost.
    if (session.tracing && session.context) {
      const path = session.tracePath ?? defaultTracePath();
      await session.context.tracing.stop({ path }).catch(() => {});
      session.tracing = false;
      session.tracePath = path;
    }
    await session.context?.close().catch(() => {});
    session.context = undefined;
    session.pages.clear();
    return { closed: "all", trace: session.tracePath };
  }
  const page = session.pages.get(a.id);
  await page?.close();
  session.pages.delete(a.id);
  return { closed: a.id };
}
