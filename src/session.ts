import type { WebSocket } from "ws";
import type { BrowserContext, Page } from "playwright";

export interface AuthState {
  headers: Record<string, string>;
  cookies: Record<string, string>;
}

export interface LoadedSpec {
  source: string;
  kind: "openapi" | "asyncapi";
  title?: string;
  version?: string;
  baseUrl?: string;
  bundled: any; // JSON-safe: internal $refs preserved (used for contract resource + ajv)
  deref: any; // fully dereferenced: selective reads only (may be circular)
  validationId: string; // ajv schema id under which `bundled` is registered
}

export interface LastResponse {
  method: string;
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  bodyText: string;
  durationMs: number;
  operationId?: string;
  matchedPath?: string;
}

export interface SocketFrame {
  at: number;
  dir: "in" | "out";
  data: string;
}

export interface SocketEntry {
  id: string;
  url: string;
  ws: WebSocket;
  open: boolean;
  frames: SocketFrame[]; // full history (in + out)
  inbox: SocketFrame[]; // inbound frames not yet consumed by ws_recv
  waiters: Array<(f: SocketFrame) => void>;
  closeInfo?: { code: number; reason: string };
}

export interface BrowserNetEntry {
  at: number;
  kind: "request" | "response" | "wsopen" | "wsframe-sent" | "wsframe-recv" | "wsclose";
  method?: string;
  url: string;
  status?: number;
  payload?: string;
}

export interface ConsoleEntry {
  at: number;
  type: string;
  text: string;
}

export interface HttpExchange {
  startedAt: number;
  durationMs: number;
  request: { method: string; url: string; headers: Record<string, string>; body?: string };
  response: { status: number; statusText: string; headers: Record<string, string>; bodyText: string; mimeType: string };
}

export interface AssertResult {
  name: string;
  ok: boolean;
  detail: string;
  at: number;
}

export interface OAuthState {
  tokenUrl?: string;
  grant?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  clientAuth?: "basic" | "body";
  refreshToken?: string;
  expiresAt?: number; // epoch ms
}

export class Session {
  spec?: LoadedSpec;
  baseUrl?: string; // fallback target when no spec is loaded (e.g. elicited from the user)
  auth: AuthState = { headers: {}, cookies: {} };
  lastResponse?: LastResponse;
  history: HttpExchange[] = [];
  results: AssertResult[] = [];
  oauth: OAuthState = {};
  sockets = new Map<string, SocketEntry>();

  // Browser plane (lazily initialised; the Chromium process is shared via the pool)
  context?: BrowserContext;
  pages = new Map<string, Page>();
  net: BrowserNetEntry[] = [];
  console: ConsoleEntry[] = [];
}
