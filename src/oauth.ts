import type { Session } from "./session.js";
import { mask } from "./redact.js";

export interface OAuthArgs {
  tokenUrl: string;
  grant: "client_credentials" | "password" | "refresh_token";
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  refreshToken?: string;
  scope?: string;
  audience?: string;
  clientAuth?: "basic" | "body";
}

function buildBody(a: OAuthArgs, useBasic: boolean): URLSearchParams {
  const body = new URLSearchParams();
  body.set("grant_type", a.grant);
  if (a.scope) body.set("scope", a.scope);
  if (a.audience) body.set("audience", a.audience);
  if (a.grant === "password") {
    body.set("username", a.username ?? "");
    body.set("password", a.password ?? "");
  }
  if (a.grant === "refresh_token") {
    body.set("refresh_token", a.refreshToken ?? "");
  }
  if (!useBasic) {
    if (a.clientId) body.set("client_id", a.clientId);
    if (a.clientSecret) body.set("client_secret", a.clientSecret);
  }
  return body;
}

async function requestToken(a: OAuthArgs): Promise<any> {
  const useBasic = a.clientAuth === "basic" || (a.clientAuth !== "body" && !!a.clientSecret);
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (useBasic && a.clientId) {
    headers["Authorization"] = "Basic " + Buffer.from(`${a.clientId}:${a.clientSecret ?? ""}`).toString("base64");
  }
  const res = await fetch(a.tokenUrl, { method: "POST", headers, body: buildBody(a, useBasic) });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`token endpoint returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.error) {
    throw new Error(`token request failed (${res.status}): ${json.error ?? text.slice(0, 200)}`);
  }
  return json;
}

function store(session: Session, a: OAuthArgs, token: any): unknown {
  const accessToken = token.access_token;
  if (!accessToken) throw new Error("token response had no access_token");
  session.auth.headers["Authorization"] = `${token.token_type ?? "Bearer"} ${accessToken}`;
  session.oauth = {
    tokenUrl: a.tokenUrl,
    grant: a.grant,
    clientId: a.clientId,
    clientSecret: a.clientSecret,
    scope: a.scope,
    clientAuth: a.clientAuth,
    refreshToken: token.refresh_token ?? a.refreshToken,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
  };
  return {
    ok: true,
    tokenType: token.token_type ?? "Bearer",
    accessToken: mask(accessToken),
    expiresInSec: token.expires_in,
    scope: token.scope ?? a.scope,
    hasRefreshToken: !!session.oauth.refreshToken,
    note: "Authorization header now set for http_request and ws_connect",
  };
}

export async function oauthToken(session: Session, a: OAuthArgs): Promise<unknown> {
  return store(session, a, await requestToken(a));
}

/** Refresh the access token if it is expired (or about to expire) and a refresh token exists. */
export async function ensureFreshToken(session: Session): Promise<void> {
  const o = session.oauth;
  if (!o.expiresAt || !o.tokenUrl) return;
  if (Date.now() < o.expiresAt - 5000) return; // still valid (5s skew)
  if (o.refreshToken) {
    const token = await requestToken({
      tokenUrl: o.tokenUrl,
      grant: "refresh_token",
      clientId: o.clientId,
      clientSecret: o.clientSecret,
      refreshToken: o.refreshToken,
      scope: o.scope,
      clientAuth: o.clientAuth,
    });
    store(session, { tokenUrl: o.tokenUrl, grant: "refresh_token", clientId: o.clientId, clientSecret: o.clientSecret, scope: o.scope, clientAuth: o.clientAuth }, token);
  } else if (o.grant === "client_credentials") {
    const token = await requestToken({
      tokenUrl: o.tokenUrl,
      grant: "client_credentials",
      clientId: o.clientId,
      clientSecret: o.clientSecret,
      scope: o.scope,
      clientAuth: o.clientAuth,
    });
    store(session, { tokenUrl: o.tokenUrl, grant: "client_credentials", clientId: o.clientId, clientSecret: o.clientSecret, scope: o.scope, clientAuth: o.clientAuth }, token);
  }
}
