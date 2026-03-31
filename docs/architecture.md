# Architecture

## Layered design

```
+---------------------------------------------+
|                  CLI / REPL                   |  index.ts
|  parse args, dispatch commands, tab complete  |  src/commands/{scan,finding}.ts
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
|  34 tools, background scans, findings store,  |
|  progress notifications, context budget       |
+---------------------------------------------+
```

Each layer depends only on the one directly below it. Users who want raw MCP access use `McpClient` directly; the REPL and commands use `RavenHelpers` for typed convenience.

**Cross-cutting:** `src/config.ts` exports `SERVER_BIN` (binary path) and `SERVER_CONFIG` (config path, derived from the binary location). Both are env-overridable (`RAVEN_SERVER`, `RAVEN_CONFIG`). The transport injects `RAVEN_CONFIG` into the spawned server's environment so the server always finds its config regardless of the client's working directory.

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
     |                              |
     v (async)                      v (async, parallel)
readLoop() reads stdout chunks      stderrLoop() reads stderr
  -> splits on newlines              -> bounded buffer (100 lines)
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

While a long-running tool executes (nmap, nikto, etc.), the server's ProgressTicker sends periodic notifications:

```
Server -> stdout: {"jsonrpc":"2.0","method":"notifications/message","params":{"level":"info","data":"nmap scanning 127.0.0.1... (15s elapsed)"}}
     |
     v
readLoop() parses JSON, sees no "id" field
  -> dispatches to notificationHandler (registered by McpClient)
     |
     v
McpClient notification handler
  -> checks method === "notifications/message"
  -> extracts params.data as string
  -> calls onProgress callback
     |
     v
REPL prints: [progress] nmap scanning 127.0.0.1... (15s elapsed)
```

## Config resolution

The server binary looks for `config/default.toml` relative to its CWD. Since the client spawns the server, the CWD is the client's directory — not the server project. Without intervention, the server silently falls back to built-in defaults, losing `tool_paths`, `sudo_tools`, and `[metasploit]` config.

```
SERVER_BIN = ~/RustroverProjects/raven-nest-mcp/target/release/raven-server
                                                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                                 resolve("..","..") from here
                                                          |
SERVER_CONFIG = ~/RustroverProjects/raven-nest-mcp/config/default.toml

StdioTransport.start() passes: env.RAVEN_CONFIG = SERVER_CONFIG
```

Both paths are overridable via env vars for non-standard layouts.

## Type system

```
src/types/
  jsonrpc.ts    JsonRpcRequest, JsonRpcResponse, JsonRpcNotification, JsonRpcMessage
  mcp.ts        InitialiseResult, ToolDefinition, ToolCallResult, LogLevel, LoggingNotificationParams
  finding.ts    Severity, Finding, SaveFindingParams
  scan.ts       ScanStatus, LaunchScanParams, ScanIdParams, ScanResultsParams
  index.ts      barrel re-exports
```

Design choices:
- **String literal unions** over TS enums: `"Critical" | "High" | "Medium" | "Low" | "Info"` maps directly to JSON without conversion
- **`JsonRpcMessage` union** discriminated by presence of `id` field: notifications have no `id`, responses do
- **Optional properties** (`evidence?: string`) map to Rust `Option<String>` and are omitted from JSON when undefined

## Transport reliability

| Feature | Mechanism |
|---------|-----------|
| Request timeouts | `setTimeout` per request, 120s default, cleared on response or stop |
| Progress-based timeout reset | `resetPendingTimers()` restarts all pending timers when progress notifications arrive |
| Stderr capture | Parallel `stderrLoop()`, bounded buffer (100 lines via push/shift) |
| Notification dispatch | Callback registered via `onNotification()`, dispatched with optional chaining |
| Tool list caching | `cachedTools: T[] \| null` in McpClient, null = not fetched, cleared on disconnect |
| Config injection | `RAVEN_CONFIG` env var passed to spawned server via `Bun.spawn({ env })` |

## Test coverage

**Integration tests** — 39 tests across 2 files (`src/`), against the real Rust server:
- Handshake and protocol negotiation
- Tool discovery and caching (cache hit, refresh, disconnect clears)
- Tool invocation (ping, findings CRUD, scan lifecycle, report generation)
- Error handling (nonexistent tool, missing params, invalid IDs)
- Typed helper layer (RavenHelpers finding + scan methods)

**E2E tests** — 61 tests across 6 files (`tests/e2e/`), against Docker targets:
- Pure function tests: tokenize, coerceArgs, parseArgs edge cases
- REPL code paths: call with coerceArgs, quoted multi-word values, NaN validation, error recovery
- All 34 server tools exercised against Juice Shop (port 3000) and bWAPP (port 80)
- Security tools: nmap, whatweb, nikto, nuclei, feroxbuster, ffuf, dalfox, sqlmap, wpscan, testssl, subfinder, dnsrecon, enum4linux_ng, masscan, hydra, john
- Metasploit: msf_search, msf_module_info, msf_auxiliary, msf_sessions, msf_exploit, msf_post
- Progress notification routing (stderr only) and timer reset verification
- Edge cases: invalid UUID behavior, CLI stdout/stderr separation
