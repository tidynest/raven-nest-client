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

## Next Steps

Pick one to continue:

1. **CLI polish** — coloured output, `describe <tool>` command showing full schema
2. **More tool tests** — test additional tools beyond `ping_target` in the test suite
3. **REPL polish** — missing tool name validation, empty input handling, command history

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
