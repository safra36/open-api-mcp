/**
 * Opt-in TLS relaxation for local development against self-signed HTTPS servers.
 *
 * Enable with MCP_TLS_INSECURE=1. This disables certificate verification for the
 * MCP's outbound HTTP (fetch), WebSocket (ws), and browser (Playwright) calls so
 * it can reach dev servers using a self-signed cert (e.g. local serviceless mode
 * serving https://127.0.0.1). Never enable it against hosts you don't control.
 */
export const INSECURE_TLS = /^(1|true|yes|on)$/i.test(process.env.MCP_TLS_INSECURE ?? "");

if (INSECURE_TLS) {
  // The built-in fetch (undici) and `ws` read NODE_TLS_REJECT_UNAUTHORIZED per
  // connection. Scoping the relaxation to a single request would require pulling
  // in the `undici` package as a dispatcher, which doesn't support this project's
  // Node 18 baseline — so we flip the process switch, but only when opted in.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

/**
 * When TLS is relaxed, rewrite a `localhost` hostname to `127.0.0.1`.
 *
 * Node 18's resolver prefers IPv6 (`::1`) for `localhost`, which yields
 * ECONNREFUSED against the common IPv4-only dev-server bind. Only applied with
 * INSECURE_TLS on: with verification enabled the hostname change could trip cert
 * hostname checks (a cert issued for `localhost` would no longer match).
 */
export function preferIpv4Loopback(target: URL): URL {
  if (INSECURE_TLS && target.hostname === "localhost") target.hostname = "127.0.0.1";
  return target;
}
