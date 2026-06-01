export interface SafetyConfig {
  hostAllowlist: string[]; // empty = allow any host
  readOnly: boolean;
  maxBodyBytes: number;
}

export function loadConfig(): SafetyConfig {
  const allow = (process.env.MCP_HOST_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    hostAllowlist: allow,
    readOnly: /^(1|true|yes|on)$/i.test(process.env.MCP_READ_ONLY ?? ""),
    maxBodyBytes: Number(process.env.MCP_MAX_BODY_BYTES ?? 100_000),
  };
}

export function hostAllowed(cfg: SafetyConfig, urlStr: string): boolean {
  if (cfg.hostAllowlist.length === 0) return true;
  try {
    return cfg.hostAllowlist.includes(new URL(urlStr).host);
  } catch {
    return false;
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function methodAllowed(cfg: SafetyConfig, method: string): boolean {
  if (!cfg.readOnly) return true;
  return !MUTATING.has(method.toUpperCase());
}
