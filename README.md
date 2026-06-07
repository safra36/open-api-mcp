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

Then, in chat: *"load_spec from http://localhost:3000, read app://manifest, exercise the endpoints, then export_report markdown."* — the last step writes a full `test-report-ddmmyy.md`. For absolute-URL calls you don't even need a spec — `http_request` works freeform.

### Auto behaviour (no spec? review the code)

The server ships **connect-time instructions** (sent on `initialize`, folded into the model's context by Claude Code) telling the agent to: discover a spec → **if none is found, read the project's source, build an OpenAPI 3 spec and register it with `synthesize_spec` (in memory, no file dropped in the repo)** → test → report. Reinforcing this, `load_spec` against a spec-less base URL returns a `NO_SPEC_FOUND` action with the exact next steps rather than a dead error. So pointing the agent at a bare base URL is enough — it knows to fall back to code review on its own.

There are also MCP prompts — the client-agnostic equivalent of slash commands — that encode whole flows in one invocation: **`api_test`** (`base_url`, optional `report_path`) runs the discover → test → report loop, and **`jest_suite`** (`base_url`, optional `test_dir`) drives a live session and then writes a dedicated Jest test folder (unit + contract + replay).

### Missing inputs (base URL, tokens) mid-loop

The agent should never fabricate a base URL or credential. When something is missing:

- **Elicitation** — if the client supports it, the server prompts the user directly. `http_request` with no known target asks *"What base URL is the app running at?"*; `auth_set` called without the secret asks for the token. The answer flows back into the session and the call proceeds.
- **Fallback** — clients without elicitation get a clear signal instead: tools return `MISSING_INPUT` (no base URL) or `authRequired` (on 401/403), and the connect-time instructions tell the agent to ask the user and retry. So it works everywhere, just via chat instead of a popup.

## Tools

**Knowledge** — `load_spec` (file / spec URL / base-URL auto-discovery, `$ref`-resolved) · `synthesize_spec` (register an OpenAPI/AsyncAPI doc the agent built from the source code, held **in memory** — no file written to the target project) · `set_target` (prime base URL + token up front to skip prompts) · resources `app://manifest`, `app://contract`, `app://session`, `app://report`.

**HTTP** — `auth_set` (bearer/header/basic/cookie) · `oauth_token` (client_credentials / password / refresh_token, auto-refreshed) · `http_request` (any method, path or absolute URL, `dryRun`/`confirm`) · `http_validate_last` (schema drift).

**WebSocket** — `ws_connect` · `ws_send` · `ws_recv` (timeout + regex) · `ws_expect` (assert a typed AsyncAPI message arrives) · `ws_close`.

**Browser** (Playwright in-process) — `browser_open` · `browser_snapshot` (aria tree) · `browser_act` · `browser_eval` · `browser_screenshot` · `browser_network` (page HTTP **and** WS frames) · `browser_console` · `browser_capture_auth` (UI login → cookies/token to all planes) · `browser_close`.

**Assertions & reporting** — `assert` (status / bodyContains / jsonPointer+equals / schemaValid / JS expression) · `export_report`:
- **`markdown`** — the full, human-readable **final report**: contract/oracle (flagging a synthesized in-memory spec as the mock contract), every assertion, each HTTP request+response with headers and bodies, WebSocket frames, browser network & console, and session context. Always written to a file — defaults to **`test-report-ddmmyy.md`** in the working directory.
- **`junit`** / **`har`** / **`json`** — CI artifacts; returned inline when no `path` is given.
- **`jest`** — a runnable suite that replays the executed requests (reads auth from `API_AUTH`/`API_KEY`/`API_COOKIE`).

Secrets are redacted across every format (auth headers, cookies, and common token/password/secret body fields; bodies capped at 50k chars in the Markdown report).

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
| `MCP_TLS_INSECURE` | off | accept self-signed/invalid TLS certs across all planes (HTTP, WS, browser) and route `localhost`→`127.0.0.1`; **local dev only** |

## HTTP transport

```bash
MCP_TRANSPORT=http MCP_PORT=7800 node dist/index.js
# POST/GET/DELETE http://127.0.0.1:7800/mcp  (each client session is isolated)
```

Bound to localhost with DNS-rebinding protection by default — the control plane is treated as hostile-network-adjacent (cf. CVE-2025-52882).
