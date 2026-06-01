const MIN_MS = Number(process.env.MCP_RATE_LIMIT_MS ?? 0);
const lastByHost = new Map<string, number>();

/** Enforce a minimum interval between requests to the same host (off when MCP_RATE_LIMIT_MS unset). */
export async function rateLimit(host: string): Promise<void> {
  if (!MIN_MS) return;
  const now = Date.now();
  const wait = (lastByHost.get(host) ?? 0) + MIN_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastByHost.set(host, Date.now());
}
