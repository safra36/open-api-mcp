const SENSITIVE = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "api-key",
]);

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE.has(k.toLowerCase()) ? "***redacted***" : v;
  }
  return out;
}

/** Mask a secret for display: keep a short prefix, hide the rest. */
export function mask(secret: string): string {
  if (secret.length <= 8) return "***";
  return secret.slice(0, 6) + "…(" + (secret.length - 6) + " more)";
}
