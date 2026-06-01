import { writeFile } from "node:fs/promises";
import type { HttpExchange, Session } from "./session.js";
import { redactHeaders } from "./redact.js";

export function buildReport(session: Session): unknown {
  const passed = session.results.filter((r) => r.ok).length;
  return {
    spec: session.spec ? { title: session.spec.title, version: session.spec.version, baseUrl: session.spec.baseUrl } : null,
    summary: { assertions: session.results.length, passed, failed: session.results.length - passed, requests: session.history.length },
    results: session.results,
    requests: session.history.map((e) => ({
      method: e.request.method,
      url: e.request.url,
      status: e.response.status,
      durationMs: e.durationMs,
    })),
  };
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function toJUnit(session: Session): string {
  const failures = session.results.filter((r) => !r.ok).length;
  const cases = session.results
    .map((r) => {
      const body = r.ok ? "" : `<failure message="${xmlEscape(r.detail)}"/>`;
      return `    <testcase name="${xmlEscape(r.name)}" time="0">${body}</testcase>`;
    })
    .join("\n");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuites tests="${session.results.length}" failures="${failures}">`,
    `  <testsuite name="open-api-mcp" tests="${session.results.length}" failures="${failures}">`,
    cases,
    `  </testsuite>`,
    `</testsuites>`,
  ].join("\n");
}

function harHeaders(headers: Record<string, string>): { name: string; value: string }[] {
  return Object.entries(redactHeaders(headers)).map(([name, value]) => ({ name, value }));
}

function harEntry(e: HttpExchange): unknown {
  const u = new URL(e.request.url);
  return {
    startedDateTime: new Date(e.startedAt).toISOString(),
    time: e.durationMs,
    request: {
      method: e.request.method,
      url: e.request.url,
      httpVersion: "HTTP/1.1",
      headers: harHeaders(e.request.headers),
      queryString: [...u.searchParams.entries()].map(([name, value]) => ({ name, value })),
      postData: e.request.body ? { mimeType: "application/json", text: e.request.body } : undefined,
      headersSize: -1,
      bodySize: e.request.body ? e.request.body.length : 0,
    },
    response: {
      status: e.response.status,
      statusText: e.response.statusText,
      httpVersion: "HTTP/1.1",
      headers: harHeaders(e.response.headers),
      content: { size: e.response.bodyText.length, mimeType: e.response.mimeType, text: e.response.bodyText },
      headersSize: -1,
      bodySize: e.response.bodyText.length,
    },
    cache: {},
    timings: { send: 0, wait: e.durationMs, receive: 0 },
  };
}

export function toHAR(session: Session): unknown {
  return {
    log: {
      version: "1.2",
      creator: { name: "open-api-mcp", version: "0.1.0" },
      entries: session.history.map(harEntry),
    },
  };
}

export async function exportReport(
  session: Session,
  args: { format: "junit" | "har" | "json"; path?: string },
): Promise<unknown> {
  let content: string;
  if (args.format === "junit") content = toJUnit(session);
  else if (args.format === "har") content = JSON.stringify(toHAR(session), null, 2);
  else content = JSON.stringify(buildReport(session), null, 2);

  if (args.path) {
    await writeFile(args.path, content, "utf8");
    return { written: args.path, format: args.format, bytes: content.length };
  }
  return { format: args.format, content };
}
