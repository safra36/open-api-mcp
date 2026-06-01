# open-api-mcp

An MCP server for **AI-driven API integration testing**. Point it at a deployed service and let an agent drive it across three planes — HTTP, WebSocket, and a real browser — with **spec-aware validation**: it doesn't just call endpoints, it checks responses and frames against the schemas your OpenAPI / AsyncAPI docs promised, and reports drift.

## Why this over gluing existing servers together

- **Unified session/auth across all three planes.** Log in once (UI, OAuth, or static token); cookies/tokens propagate to HTTP and WS automatically.
- **Validation, not just invocation.** `http_validate_last` / `ws_expect` compare what you got against what the spec documents.
- **First-class WebSocket frame testing** with AsyncAPI message-schema assertions.
- **One situational-awareness surface** — the agent reads `app://manifest`, `app://session`, `app://report` to know what it can do and what it's already done.

## Install

```bash
npm install
npm run build
npx playwright install chromium   # only needed for the browser_* tools
```

## Register with Claude Code

```bash
# stdio (default)
claude mcp add open-api-mcp -- node /abs/path/to/open-api-mcp/dist/index.js
```

Then, in chat: *"load_spec from http://localhost:3000, read app://manifest, exercise the endpoints, then export_report junit."* For absolute-URL calls you don't even need a spec — `http_request` works freeform.

## Tools

**Knowledge** — `load_spec` (file / spec URL / base-URL auto-discovery, `$ref`-resolved) · resources `app://manifest`, `app://contract`, `app://session`, `app://report`.

**HTTP** — `auth_set` (bearer/header/basic/cookie) · `oauth_token` (client_credentials / password / refresh_token, auto-refreshed) · `http_request` (any method, path or absolute URL, `dryRun`/`confirm`) · `http_validate_last` (schema drift).

**WebSocket** — `ws_connect` · `ws_send` · `ws_recv` (timeout + regex) · `ws_expect` (assert a typed AsyncAPI message arrives) · `ws_close`.

**Browser** (Playwright in-process) — `browser_open` · `browser_snapshot` (aria tree) · `browser_act` · `browser_eval` · `browser_screenshot` · `browser_network` (page HTTP **and** WS frames) · `browser_console` · `browser_capture_auth` (UI login → cookies/token to all planes) · `browser_close`.

**Assertions & reporting** — `assert` (status / bodyContains / jsonPointer+equals / schemaValid / JS expression) · `export_report` (JUnit / HAR / JSON; secrets redacted).

## Configuration (env)

| Var | Default | Effect |
| --- | --- | --- |
| `MCP_TRANSPORT` | `stdio` | `http` to serve Streamable HTTP instead |
| `MCP_BIND` / `MCP_PORT` | `127.0.0.1` / `7800` | HTTP transport bind (DNS-rebinding protection on) |
| `MCP_READ_ONLY` | off | block POST/PUT/PATCH/DELETE |
| `MCP_HOST_ALLOWLIST` | empty (any) | comma-separated allowed hosts |
| `MCP_REQUIRE_CONFIRM` | off | mutating calls need `confirm:true` |
| `MCP_RATE_LIMIT_MS` | `0` | min ms between requests per host |
| `MCP_MAX_BODY_BYTES` | `100000` | response body truncation in tool output |
| `MCP_BROWSER_HEADED` | off | show the browser |
| `MCP_BROWSER_MAX` | `4` | max concurrent browser contexts |

## HTTP transport

```bash
MCP_TRANSPORT=http MCP_PORT=7800 node dist/index.js
# POST/GET/DELETE http://127.0.0.1:7800/mcp  (each client session is isolated)
```

Bound to localhost with DNS-rebinding protection by default — the control plane is treated as hostile-network-adjacent (cf. CVE-2025-52882).
