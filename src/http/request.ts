import { hostAllowed, methodAllowed, type SafetyConfig } from "../config.js";
import type { Session } from "../session.js";
import { ensureFreshToken } from "../oauth.js";
import { rateLimit } from "../ratelimit.js";
import { findMatchingPath } from "../spec/match.js";
import { cookieHeader, deriveSpecPath, hasHeader, joinUrl, mergeSetCookie, truncate } from "../util.js";

const REQUIRE_CONFIRM = /^(1|true|yes|on)$/i.test(process.env.MCP_REQUIRE_CONFIRM ?? "");
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface HttpArgs {
  method: string;
  path?: string;
  url?: string;
  query?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  body?: unknown;
  dryRun?: boolean;
  confirm?: boolean;
}

export async function httpRequest(session: Session, cfg: SafetyConfig, a: HttpArgs): Promise<unknown> {
  const method = a.method.toUpperCase();
  if (!methodAllowed(cfg, method))
    throw new Error(`read-only mode is on: ${method} is blocked (unset MCP_READ_ONLY to allow)`);

  // Resolve the target URL and the spec path used for validation matching.
  let urlStr: string;
  let specPath: string | undefined;
  if (a.url) {
    urlStr = a.url;
  } else {
    const base = session.spec?.baseUrl ?? session.baseUrl;
    if (!base)
      throw new Error(
        "MISSING_INPUT: no base URL known — ask the user for the app's base URL (e.g. http://localhost:3000), or pass an absolute `url`. Do not guess it.",
      );
    specPath = a.path ?? "/";
    urlStr = joinUrl(base, specPath);
  }

  const u = new URL(urlStr);
  if (a.query) for (const [k, v] of Object.entries(a.query)) u.searchParams.set(k, String(v));
  if (!hostAllowed(cfg, u.toString())) throw new Error(`host not in allowlist: ${u.host}`);

  await ensureFreshToken(session);

  const headers: Record<string, string> = { ...session.auth.headers, ...(a.headers ?? {}) };
  const cookie = cookieHeader(session.auth.cookies);
  if (cookie && !hasHeader(headers, "cookie")) headers["Cookie"] = cookie;

  let body: string | undefined;
  if (a.body !== undefined && method !== "GET" && method !== "HEAD") {
    if (typeof a.body === "string") {
      body = a.body;
    } else {
      body = JSON.stringify(a.body);
      if (!hasHeader(headers, "content-type")) headers["Content-Type"] = "application/json";
    }
  }

  // Dry-run / confirmation gate for mutating calls.
  const isMutating = MUTATING.has(method);
  if (a.dryRun || (REQUIRE_CONFIRM && isMutating && !a.confirm)) {
    return {
      dryRun: true,
      wouldSend: { method, url: u.toString(), headers: Object.keys(headers), body },
      hint: a.dryRun ? "dry run only — set dryRun:false to send" : "confirmation required — re-call with confirm:true",
    };
  }

  await rateLimit(u.host);

  const started = Date.now();
  const res = await fetch(u.toString(), { method, headers, body });
  const responseText = await res.text();
  const durationMs = Date.now() - started;

  let parsed: unknown = responseText;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("json")) {
    try {
      parsed = JSON.parse(responseText);
    } catch {
      /* keep raw text */
    }
  }

  const setCookie = res.headers.get("set-cookie");
  if (setCookie) mergeSetCookie(session.auth.cookies, setCookie);

  if (!specPath && session.spec?.baseUrl) specPath = deriveSpecPath(session.spec.baseUrl, u);
  const match = specPath ? findMatchingPath(session.spec, specPath, method) : undefined;
  const responseHeaders = Object.fromEntries(res.headers as any) as Record<string, string>;

  session.lastResponse = {
    method,
    url: u.toString(),
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
    body: parsed,
    bodyText: responseText,
    durationMs,
    operationId: match?.operationId,
    matchedPath: match?.template,
  };

  session.history.push({
    startedAt: started,
    durationMs,
    request: { method, url: u.toString(), headers, body },
    response: { status: res.status, statusText: res.statusText, headers: responseHeaders, bodyText: responseText, mimeType: ct || "text/plain" },
  });
  if (session.history.length > 500) session.history.splice(0, session.history.length - 500);

  const shown = truncate(responseText, cfg.maxBodyBytes);
  return {
    request: { method, url: u.toString() },
    status: res.status,
    statusText: res.statusText,
    durationMs,
    matchedOperation: match ? { path: match.template, operationId: match.operationId } : null,
    headers: responseHeaders,
    bodyTruncated: shown.truncated,
    body: ct.includes("json") && typeof parsed !== "string" ? parsed : shown.text,
    hint: match ? "run http_validate_last to check this response against the spec" : undefined,
    authRequired:
      res.status === 401 || res.status === 403
        ? "got " + res.status + " — ask the user for credentials, then auth_set / oauth_token, or login via browser_open + browser_capture_auth"
        : undefined,
  };
}
