# Raven Nest Client — Progress

## What is this?

A TypeScript + Bun MCP client for [raven-nest-mcp](https://github.com/tidynest/raven-nest-mcp). Speaks JSON-RPC 2.0 over stdio to the Rust MCP server. Learning project for TypeScript/Bun + Rust interop.

## Completed (2026-03-13)

### Step 1 — Project scaffold
- `bun init -y` with default config
- Created `src/types/` and `src/client/` structure

### Step 2 — Type definitions
- `src/types/jsonrpc.ts` — JSON-RPC 2.0 base types (request, response, error, type guard)
- `src/types/mcp.ts` — MCP protocol types (InitialiseResult, ToolDefinition, ToolCallResult, etc.)

### Step 3 — Transport + MCP client
- `src/client/transport.ts` — Spawns the Rust binary via `Bun.spawn`, pipes JSON-RPC through stdin/stdout, matches responses to requests via pending Map
- `src/client/mcp-client.ts` — High-level client: handshake (initialize + notifications/initialized), `listTools()`, `callTool()`, `disconnect()`

### Step 4 — Smoke test
- `index.ts` connects to raven-server, lists all 22 tools — **passing**

### Step 5 — Integration tests (2026-03-14)
- `src/client/mcp-client.test.ts` — `bun test` verifies handshake and tool listing
- 2 tests, 5 assertions, all passing (44ms)
- Added inline comments across all source files

### Step 6 — Tool invocation test (2026-03-14)
- Added `ping_target` test to `mcp-client.test.ts` — full round-trip: handshake → tool call → result parsing
- 3 tests, 11 assertions, all passing
- Confirms `callTool()` works against real server with real network I/O (~3s for ICMP ping)

### Step 7 — CLI entry point (2026-03-14)
- Converted `index.ts` from smoke test to CLI dispatcher
- `bun run index.ts list` — discovers and prints all 22 tools with descriptions and required params
- `bun run index.ts call <tool> [key=value ...]` — invokes any tool generically via `callTool()`
- Early validation exits before connecting if command is invalid
- No tool-specific code on the client — server is the single source of truth

### Step 8 — CLI error handling (2026-03-14)
- Missing tool name on `call` exits early with usage hint (no server connection)
- Invalid tool name shows clean one-line error from server (`MCP error -32602: tool not found`)
- `catch` block uses `(err as Error).message` instead of dumping the full stack trace

### Step 9 — Interactive REPL (2026-03-14)
- `bun run index.ts` with no args launches interactive mode
- Commands: `list`, `call <tool> [key=value ...]`, `help`, `quit`
- Single server connection stays alive across multiple commands
- Per-command try/catch — errors print cleanly without crashing the loop
- Extracted shared `connect()` function to eliminate duplication between one-shot and REPL paths
- `ask()` helper wraps readline's callback-based `question()` in a Promise for async/await

### Step 10 — Pre-commit audit & cleanup (2026-03-14)
- Fixed argument parsing vulnerability: `pair.split("=")` replaced with `parseArgs()` using `indexOf("=")` + `slice` — handles missing `=` and values containing `=`
- REPL robustness: wrapped `repl()` in `try/finally` so `rl.close()` and `client.disconnect()` run even if `connect()` throws
- Eliminated duplication: extracted `printToolList()` to replace identical 8-line blocks in one-shot and REPL paths
- Strict equality: `!=`/`==` → `!==`/`===` across `index.ts` and `transport.ts` (kept `== null` where intentional)
- Top-level error handling: `main()` → `main().catch(console.error)` to surface unhandled rejections
- Logged parse errors in transport read loop instead of silently swallowing
- Made server path configurable via `RAVEN_SERVER` env var with fallback to default path
- Rewrote comments across all source files for accuracy and consistency
- Completed `package.json`: added version 0.1.0, description, scripts, license
- Added `.claude/` and `CLAUDE.md` to `.gitignore`
- Added MIT LICENSE
- Replaced bun-init README template with project documentation
- First commit (`v0.1.0`) pushed to [GitHub](https://github.com/tidynest/raven-nest-client) and [GitLab](https://gitlab.com/tidynest/raven-nest-client)

### Step 11 — Extended test suite (2026-03-14)
- Added Findings CRUD tests: save → get → list → delete — full data lifecycle with self-cleanup
- Added Report generation tests: empty report format, report with saved finding includes severity
- Added Error handling tests: nonexistent tool, missing required params, invalid finding ID
- 16 tests, 28 assertions, all passing
- Discovered server behaviors: severity title-casing, report saves to file, graceful invalid ID handling

### Step 12 — REPL polish (2026-03-14)
- Empty input handling: blank lines re-prompt silently instead of printing "Unknown command"
- Missing tool name validation: `call` without a tool name shows usage hint
- Command history: up/down arrow cycles through previous commands (readline `history` option)

### Step 13 — CLI polish (2026-03-14)
- Added ANSI colour output: amber tool names, dim descriptions, cyan labels, red errors, green connection, magenta prompt
- Added `describe <tool>` command showing full parameter schema with types, required/optional tags, and descriptions
- Works in both one-shot (`bun run index.ts describe ping_target`) and REPL (`describe ping_target`) modes
- Updated help text and usage messages to include `describe`

### Step 14 — Server binary existence check (2026-03-14)
- Added `Bun.file(binPath).exists()` guard in `transport.ts:start()` before `Bun.spawn()`
- Wrong/missing path now gives `"Server binary not found: /path/to/binary"` instead of a cryptic OS error
- 3 lines, early-return pattern

### Step 15 — README accuracy fix (2026-03-14)
- Updated test count: 3 → 16 tests, 11 → 28 assertions
- Added `describe <tool>` to the commands list

### Step 16 — Request timeouts (2026-03-31)
- Added configurable `defaultTimeout` (120s) to `StdioTransport`
- Timer stored alongside resolve/reject in pending Map using `ReturnType<typeof setTimeout>`
- Timeout rejects promise and cleans up pending entry; cleared on response or stop

### Step 17 — Stderr capture (2026-03-31)
- Added `stderrLoop()` mirroring `readLoop()` but capturing raw text lines
- Bounded `string[]` buffer (max 100 lines) using `push()`/`shift()`
- Exposed via `getStderr()` returning a defensive copy

### Step 18 — Notification dispatch (2026-03-31)
- Replaced silent `continue` for id-less messages with callback dispatch
- `onNotification(handler)` registers callback; dispatched via optional chaining `?.`
- Split narrowing: separate `"id" in response` check for correct TS type discrimination

### Step 19 — Notification + logging types (2026-03-31)
- Added `JsonRpcNotification` interface (no id field) and `JsonRpcMessage` union to jsonrpc.ts
- Added `LogLevel` string literal union and `LoggingNotificationParams` to mcp.ts
- Transport now parses as `JsonRpcMessage` — fixed type error in notification dispatch

### Step 20 — Finding types (2026-03-31)
- Created `src/types/finding.ts` — `Severity`, `Finding`, `SaveFindingParams`
- Mirrors server's `Finding` struct and `SaveFindingRequest` exactly

### Step 21 — Scan types (2026-03-31)
- Created `src/types/scan.ts` — `ScanStatus`, `LaunchScanParams`, `ScanIdParams`, `ScanResultsParams`
- Mirrors server's scan request structs

### Step 22 — Tool list caching (2026-03-31)
- `cachedTools: ToolDefinition[] | null` in McpClient — null means "not fetched"
- `listTools()` returns cache on hit; `refreshTools()` clears and re-fetches
- Cache cleared on `disconnect()`

### Step 23 — Progress callback (2026-03-31)
- Optional `onProgress` callback in McpClient constructor
- Wired in `connect()`: transport notification handler filters `notifications/message` and forwards `data`

### Step 24 — Typed finding helpers (2026-03-31)
- Created `src/client/helpers.ts` — `RavenHelpers` class using composition over McpClient
- Methods: saveFinding, getFinding, listFindings, deleteFinding, generateReport

### Step 25 — Typed scan helpers (2026-03-31)
- Extended RavenHelpers with: launchScan, getScanStatus, getScanResults, cancelScan, listScans

### Step 26 — Elapsed time display (2026-03-31)
- `performance.now()` around callTool in CLI and REPL modes
- Prints dim `(completed in X.Xs)` after tool results

### Step 27 — Grouped help text (2026-03-31)
- Welcome banner with version and hint after connect
- Help grouped into Tools, Scans, Findings, Session sections

### Step 28 — Scan commands (2026-03-31)
- Created `src/commands/scan.ts` — `handleScanCommand()` dispatching launch/status/results/cancel/list
- Wired into REPL with `scan` and `scans` aliases

### Step 29 — Finding commands (2026-03-31)
- Created `src/commands/finding.ts` — `handleFindingCommand()` dispatching save/get/delete
- Wired into REPL with `finding`, `findings`, and `report` aliases

### Step 30 — Progress display (2026-03-31)
- Progress callback prints dim `[progress]` messages in REPL during long-running tools

### Step 31 — Tab completion (2026-03-31)
- Readline completer function in REPL
- Completes tool names after `call`/`describe`, command names at line start
- Uses cached tool list for synchronous access

### Step 32 — Caching tests (2026-03-31)
- Verified `listTools()` returns same reference on cache hit
- Verified `refreshTools()` returns different reference (re-fetched)

### Step 33 — Scan lifecycle tests (2026-03-31)
- Full lifecycle: launch_scan, get_scan_status, list_scans, cancel_scan
- Validates scan ID extraction from server response

### Step 34 — Additional tool tests (2026-03-31)
- save_finding with all optional fields (evidence, remediation, cvss, cve, owasp_category)
- get_finding verifies all saved fields returned
- generate_report with custom title

### Step 35 — Helper tests (2026-03-31)
- Created `src/client/helpers.test.ts`
- Finding helpers: saveFinding returns UUID, getFinding returns text, deleteFinding returns boolean
- Scan helpers: launchScan returns info, listScans returns text

### Step 36 — CLI flags (2026-03-31)
- `--version` prints version from package.json and exits
- `--help` prints grouped usage and exits
- `--no-color` disables ANSI output (also respects `NO_COLOR` env)

### Step 37 — Documentation update (2026-03-31)
- Updated README with all 34 tools, REPL command table, new project structure
- Updated PROGRESS.md with steps 16-38

### Step 38 — Architecture documentation (2026-03-31)
- Created `docs/architecture.md` with layered architecture, data flow, protocol details

### Step 39 — E2E test suite (2026-03-31 / 2026-04-01)
- Created 8 test files in `tests/e2e/` covering all 34 server tools
- Phase 1: Pure function tests — tokenize (quote-aware splitting), coerceArgs (type coercion + NaN fallback), parseArgs (key=value edge cases). 18 tests.
- Phase 2: REPL code paths via direct import — call with coerceArgs, finding save with quoted multi-word values, scan results with offset/limit, report with title, error recovery, NaN cvss/timeout validation. 8 tests.
- Phase 3: Real security tool execution against Docker targets (Juice Shop :3000, bWAPP :80) — nmap, whatweb, nikto, nuclei, http_request, background scan lifecycle, feroxbuster, ffuf, dalfox, sqlmap, wpscan, testssl, subfinder, dnsrecon, enum4linux_ng, masscan, hydra, john. 30 tests.
- Phase 3 (Metasploit): msf_search, msf_module_info, msf_auxiliary, msf_sessions, msf_exploit, msf_post — required msfrpcd on port 55553. 6 tests.
- Phase 4: Progress notifications go to stderr only; resetPendingTimers tested via short-timeout client. 2 tests.
- Phase 5: Edge cases — getFinding with zero UUID returns normal response (isError=false, "finding not found"); CLI connection messages land in stdout (known limitation). 3 tests.
- Discovered: server config not loaded when spawned from client CWD (led to Step 40)
- **61 E2E tests across 6 files, all passing. 34/34 tools exercised.**

### Step 40 — Server config auto-resolution (2026-04-01)
- Added `SERVER_CONFIG` to `src/config.ts`, derived from `SERVER_BIN` by walking up from `target/release/raven-server` to `config/default.toml`
- `StdioTransport.start()` now passes `RAVEN_CONFIG` env var when spawning server process
- Overridable via `RAVEN_CONFIG` env var (same as `RAVEN_SERVER` for the binary path)
- **Fix:** server was silently using built-in defaults when spawned from any CWD other than the server project root, losing `tool_paths` (wpscan), `sudo_tools` (masscan/nmap), `[metasploit]` config, and custom timeouts

## Totals

- **100 tests** (39 integration + 61 E2E), all passing
- **13 new files**, **12 modified files**
- Steps 1-40 complete

## Key Learnings

- `import type` is required under Bun's `verbatimModuleSyntax` for type-only imports
- MCP method names are protocol-fixed strings (`"initialize"`, not `"initialise"`)
- `Bun.spawn` with `"pipe"` gives typed streams — compiler knows `.stdin.write()` exists
- The pending Map pattern matches async responses to requests over a stream
- `as const` narrows string literals for compile-time protocol validation
- `indexOf("=")` + `slice` is TypeScript's equivalent of Rust's `splitn(2, '=')` — splits only on the first delimiter
- `for...of` iterates values, `for...in` iterates keys/indices — Rust's `for x in vec` maps to `for...of`
- `===`/`!==` (strict equality) is the TypeScript default — `==` does type coercion, only useful for `== null` (catches both null and undefined)
- `??` (nullish coalescing) is like Rust's `unwrap_or` — returns right side only if left is null/undefined
- `process.argv` indexing: `[0]` = runtime, `[1]` = script, `[2]+` = user args
- Non-null assertion `!` tells TypeScript "I've already checked this" — like Rust's `.unwrap()`
- `switch` in TypeScript needs explicit `break` — unlike Rust's `match` which doesn't fall through
- TypeScript `catch` variables are `unknown` — use `(err as Error).message` to access fields (like Rust's `downcast_ref`)
- `readline.createInterface` + `rl.question()` for interactive input — callback-based, wrap in Promise for async/await
- `line.split(" ")` + destructuring for parsing user input — same pattern as `process.argv` but from stdin
- `break` inside a `switch` only exits the switch, not an enclosing loop — check exit conditions before the switch
- Spawned processes inherit the parent's CWD, not the binary's directory — relative config paths break when the spawner and binary live in different projects. Derive config paths from the binary's absolute path, like Rust's `env::current_exe()?.parent()`
- `Bun.spawn` accepts an `env` option to override/extend the process environment — use `{ ...process.env, KEY: value }` to add a single var
- Docker containers running vulnerable web apps (Juice Shop, bWAPP) can crash under heavy scanning (feroxbuster at full threads) — restart between aggressive tests
- `msfrpcd` defaults to SSL even with `-n` flag (which disables the database, not SSL) — match the server config's `ssl` setting to whatever msfrpcd actually uses
