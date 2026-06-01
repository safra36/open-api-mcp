export function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, "") + "/" + String(path).replace(/^\/+/, "");
}

/** Strip the spec's base path prefix from an absolute URL's pathname. */
export function deriveSpecPath(baseUrl: string, target: URL): string {
  let basePath = "";
  try {
    basePath = new URL(baseUrl).pathname.replace(/\/$/, "");
  } catch {
    /* baseUrl may be path-only or invalid; treat as no prefix */
  }
  let p = target.pathname;
  if (basePath && p.startsWith(basePath)) p = p.slice(basePath.length) || "/";
  return p;
}

export function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

/** Merge a Set-Cookie value (name=value; attrs...) into the cookie jar. */
export function mergeSetCookie(jar: Record<string, string>, setCookie: string): void {
  for (const part of setCookie.split(/,(?=[^;]+=)/)) {
    const first = part.split(";")[0]?.trim();
    if (!first) continue;
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    jar[first.slice(0, eq).trim()] = first.slice(eq + 1).trim();
  }
}

export function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}

export function truncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max) + `\n…[truncated ${text.length - max} chars]`, truncated: true };
}

export function text(obj: unknown): { content: { type: "text"; text: string }[] } {
  const s = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  return { content: [{ type: "text", text: s }] };
}
