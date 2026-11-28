# Architecture

## Layered design

```
+---------------------------------------------+
|                  CLI / REPL                   |  index.ts
|  parse args, dispatch commands, tab complete  |  src/commands/{scan,finding,engagement,recon}.ts
+---------------------------------------------+
                      |
+---------------------------------------------+
|               RavenHelpers                    |  src/client/helpers.ts
|  typed finding/scan methods (composition)     |
+---------------------------------------------+
                      |
+---------------------------------------------+
|                McpClient                      |  src/client/mcp-client.ts
|  handshake, listTools (cached), callTool,     |
|  progress callback, disconnect                |
+---------------------------------------------+
                      |
+---------------------------------------------+
|              StdioTransport                   |  src/client/transport.ts
|  spawn process, JSON-RPC over stdin/stdout,   |
|  request timeouts, stderr capture,            |
|  notification dispatch, config env injection  |
+---------------------------------------------+
                |                |
         stdin/stdout      RAVEN_CONFIG env
              pipes         (from config.ts)
                |                |
+---------------------------------------------+
|             raven-nest-mcp                    |  Rust binary
|  46 tools, background scans, findings store,  |
|  progress notifications, context budget       |
+---------------------------------------------+
```

Each layer depends only on the one directly below it. Users who want raw MCP access use `McpClient` directly; the REPL and commands use `RavenHelpers` for typed convenience.

**Cross-cutting:** `src/config.ts` exports `SERVER_BIN` (a binary **path or a full launch command**, e.g. `docker run … <image>`) and `SERVER_CONFIG` (derived from the binary location for a local binary; `undefined` for a wrapper command). Both are env-overridable (`RAVEN_SERVER`, `RAVEN_CONFIG`). For a local binary the transport injects `RAVEN_CONFIG` into the spawned server's environment so it finds its config regardless of the client's CWD; for a Docker/wrapper command the server resolves its own config inside the container.

## Data flow: tool call

```
User types: call run_nmap target=127.0.0.1
     |
     v
REPL parses "call run_nmap target=127.0.0.1"
  -> cmd="call", tool="run_nmap", args={target:"127.0.0.1"}
     |
     v
McpClient.callTool("run_nmap", {target:"127.0.0.1"})
  -> transport.request("tools/call", {name:"run_nmap", arguments:{target:"127.0.0.1"}})
     |
     v
StdioTransport.request()
  1. Assigns id=N, builds JsonRpcRequest
  2. Writes JSON + newline to proc.stdin
  3. Creates Promise + setTimeout(120s)
  4. Stores {resolve, reject, timer} in pending Map
     |
     v (async)
readLoop() reads stdout chunks      (server stderr is inherited to the terminal)
  -> splits on newlines
  -> JSON.parse each line
  -> if no id: dispatch to notification handler
  -> if id matches pending: clearTimeout, resolve Promise
     |
     v
McpClient.unwrap() extracts result or throws on error
     |
     v
REPL prints result.content[0].text + elapsed time
```

## Data flow: progress notification

While a long-running tool executes (nmap, nikto, etc.), the server's ProgressTicker sends periodic notifications. It does so only for a call that carried a `progressToken`, so `callTool` puts one in `_meta` on every request:

```
Server -> stdout: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":1,"progress":15,"message":"nmap scanning 127.0.0.1... (15s elapsed)"}}
     |
     v
readLoop() parses JSON, sees no "id" field
  -> dispatches to notificationHandler (registered by McpClient)
     |
     v
McpClient notification handler
  -> checks method === "notifications/progress"
  -> extracts params.message as string
  -> calls onProgress callback
     |
     v
REPL prints: [progress] nmap scanning 127.0.0.1... (15s elapsed)
```

## Config resolution

The server looks for its config in a fixed order:
1. the file named in `RAVEN_CONFIG`,
2. `~/.config/raven-nest/config.toml`,
3. `/etc/raven-nest/config.toml`,
4. `config/default.toml` near the binary,
5. `config/default.toml` in its working directory,
6. its built-in defaults.

Steps 2 and 3 exist in servers after 0.4.2.

The client spawns the server from its own working directory, so step 5 does
not find the server project's config. For a **local binary**,
`resolveServerConfig` in `src/config.ts` therefore guesses that file from the
binary path, and the transport injects it as `RAVEN_CONFIG`. That keeps
`tool_paths`, `sudo_tools` and the `[metasploit]` settings.

```
SERVER_BIN    = <client>/../raven-nest-mcp/target/release/raven-server   (default: sibling checkout, resolved via import.meta.dir)
SERVER_CONFIG = <server-project>/config/default.toml                     (guessed - local binary only, and only if the file exists)
StdioTransport.start() passes: env.RAVEN_CONFIG = SERVER_CONFIG          (skipped when SERVER_CONFIG is undefined)
```

**Why the guess must exist:**
Servers after 0.4.2 ***refuse to start*** on a `RAVEN_CONFIG` that names a
missing file. Earlier servers skipped it with a warning. A binary outside a
checkout, such as `/opt/raven/raven-server` or a shared `CARGO_TARGET_DIR`,
makes the guess point at nothing, so the client passes no `RAVEN_CONFIG` there
and lets the server run its own lookup.

An explicit `RAVEN_CONFIG` in the client's environment is passed on unchecked.
A wrong path there is the user's to fix, and the server says so.

If `RAVEN_SERVER` is a launch command instead (e.g. `docker run --rm -i ghcr.io/tidynest/raven-nest-mcp:latest`), the transport splits it into argv and spawns it directly; `SERVER_CONFIG` stays undefined. The image carries no config file in a place the server looks, so the server starts on its built-in defaults unless a config is mounted into the container. Override either via env for non-standard layouts.

## Type system

```
src/types/
  jsonrpc.ts    JsonRpcRequest, JsonRpcResponse, JsonRpcNotification, JsonRpcMessage
  mcp.ts        InitialiseResult, ToolDefinition, ToolCallResult
  finding.ts    SaveFindingParams
  index.ts      barrel re-exports
```

Design choices:
- **Plain `string` for server-normalised fields** (`severity`): the server owns the canonical casing and enum, so the client sends a raw string and lets the server validate rather than duplicating a `Critical|High|…` union here
- **`JsonRpcMessage` union** discriminated by presence of `id` field: notifications have no `id`, responses do
- **Optional properties** (`evidence?: string`) map to Rust `Option<String>` and are omitted from JSON when undefined
- **`structuredContent`** on `ToolCallResult` carries the server's machine-readable result fields (`finding_id`, `deleted`, `scan_id`, `active`); helpers read it first and fall back to parsing the human-readable text

## Transport reliability

| Feature | Mechanism |
|---------|-----------|
| Request timeouts | `setTimeout` per request, 120s default, cleared on response or stop |
| Progress-based timeout reset | `resetPendingTimers()` restarts all pending timers when progress notifications arrive |
| Server stderr | `stderr: "inherit"` - server diagnostics pass straight to the client's terminal; the kernel drains the pipe so a chatty tool can't block |
| Notification dispatch | Callback registered via `onNotification()`, dispatched with optional chaining |
| Tool list caching | `cachedTools: T[] \| null` in McpClient, null = not fetched, cleared on disconnect |
| Config injection | `RAVEN_CONFIG` env var passed to spawned server via `Bun.spawn({ env })`, only when the user set it or the guessed file exists |

## Test coverage

**Integration tests** - in `src/`. Most run against the real Rust server; the progress contract test runs against a scripted stdio server in `tests/fixtures/`:
- Handshake and protocol negotiation
- Tool discovery and caching (cache hit, disconnect clears)
- Tool invocation (ping, findings CRUD, scan lifecycle, report generation)
- Error handling (nonexistent tool, missing params, invalid IDs)
- Typed helper layer (RavenHelpers finding, scan + engagement methods)

**E2E tests** - 6 files in `tests/e2e/`, against Docker targets:
- Pure function tests: tokenize, coerceArgs, parseArgs edge cases, recon port parsing + web-port filter
- REPL code paths: call with coerceArgs, quoted multi-word values, NaN validation, error recovery
- 36 server tools exercised against Juice Shop (port 3000), bWAPP (port 80), and local filesystem fixtures
- Security tools: nmap, whatweb, nikto, nuclei, feroxbuster, ffuf, dalfox, sqlmap, wpscan, testssl, subfinder, dnsrecon, enum4linux_ng, masscan, hydra, john
- Secret scanners: gitleaks, trufflehog (filesystem path, synthetic fixture; exit-1-on-hit mapped to success)
- Metasploit: msf_search, msf_module_info, msf_auxiliary, msf_sessions, msf_exploit, msf_post
- Progress notification routing (stderr only) and timer reset verification
- Edge cases: invalid UUID behavior, CLI stdout/stderr separation

## Releasing & badges

The README status badges are self-hosted SVGs under `badges/`, not shields.io URLs - GitHub serves repo files first-party, so they never break on its Camo image proxy. They are generated, never hand-edited.

`scripts/gen-badges.ts` is the single source of truth: the release badge reads `package.json` `version`, the tool-count badge reads `TOOL_COUNT` in that script, and segment widths are computed so no SVG geometry is edited by hand.

- **Cut a release:** `npm version <patch|minor|major>` (lockstep with the server - see the version note in the README). The `version` lifecycle script regenerates the badges and stages them into the version commit automatically.
- **Change the tool count:** edit `TOOL_COUNT` in `scripts/gen-badges.ts`, then `bun run badges`.
- **Regenerate on demand:** `bun run badges`.
