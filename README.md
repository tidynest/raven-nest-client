# raven-nest-client

TypeScript MCP client for [raven-nest-mcp](https://github.com/tidynest/raven-nest-mcp).
Speaks JSON-RPC 2.0 over stdio to the Rust MCP server (v0.3, 34 tools).

## Requirements

- [Bun](https://bun.sh) v1.3+
- The compiled `raven-server` binary from raven-nest-mcp

## Setup

```bash
bun install
```

By default the client looks for the server binary at
`~/RustroverProjects/raven-nest-mcp/target/release/raven-server`.
The server's config path is auto-derived from the binary location
(`<server-project>/config/default.toml`), so features like `tool_paths`,
`sudo_tools`, and Metasploit integration work regardless of the client's
working directory.

Override either path with env vars or a `.env` file:

```bash
RAVEN_SERVER=/path/to/raven-server
RAVEN_CONFIG=/path/to/config/default.toml
```

## Usage

**Interactive REPL** (no args):
```bash
bun run index.ts
```

**One-shot commands:**
```bash
bun run index.ts list                                # list all tools
bun run index.ts call ping_target target=127.0.0.1   # call a tool
bun run index.ts describe run_nmap                   # show tool details
```

**Flags:**
```bash
bun run index.ts --version    # print version
bun run index.ts --help       # print usage
bun run index.ts --no-color   # disable ANSI colours
```

### REPL commands

| Category | Command | Description |
|----------|---------|-------------|
| **Tools** | `list` | List all server tools |
| | `describe <tool>` | Show tool details and parameters |
| | `call <tool> [key=value ...]` | Invoke a tool |
| **Scans** | `scan launch <tool> <target>` | Start a background scan |
| | `scan status <id>` | Check scan progress |
| | `scan results <id>` | Retrieve scan output |
| | `scan cancel <id>` | Cancel a running scan |
| | `scans` | List all scans |
| **Findings** | `finding save <key=value ...>` | Save a vulnerability finding |
| | `finding get <id>` | Retrieve a finding |
| | `finding delete <id>` | Delete a finding |
| | `findings` | List all findings |
| | `report [title=...]` | Generate a report |
| **Session** | `help` | Show available commands |
| | `quit` | Exit the REPL |

Tab completion is available for tool names (after `call` or `describe`) and command names.

### Server tools (34)

**Recon:** ping_target, run_nmap, run_whatweb, run_nuclei, run_nikto, run_subfinder, run_dnsrecon, run_wpscan, run_masscan

**Exploitation:** run_sqlmap, run_hydra, run_feroxbuster, run_ffuf, run_testssl, run_enum4linux_ng, run_john, run_dalfox

**Metasploit (6):** msf_search, msf_module_info, msf_exploit, msf_auxiliary, msf_sessions, msf_post

**Utility:** http_request

**Background scans (5):** launch_scan, get_scan_status, get_scan_results, cancel_scan, list_scans

**Findings (5):** save_finding, get_finding, list_findings, delete_finding, generate_report

## Tests

**Integration tests** (no Docker needed):
```bash
bun test src/
```
39 tests, 56 assertions — handshake, tool calls, finding CRUD, scan lifecycle, caching, errors.

**E2E tests** (require Docker targets + server config):
```bash
# Start targets
docker start juice-shop infallible_satoshi

# Run individual phases (execution order matters)
bun test tests/e2e/phase1-pure.test.ts                # pure functions, no server
bun test tests/e2e/phase2-repl.test.ts                # REPL code paths
bun test tests/e2e/phase5-edge.test.ts                # edge cases
bun test tests/e2e/phase3-security.test.ts            # nmap, whatweb, nikto, nuclei
bun test tests/e2e/phase3b-remaining-tools.test.ts    # all other tools + Metasploit
bun test tests/e2e/phase4-progress.test.ts            # progress/stderr separation

# Stop targets
docker stop juice-shop infallible_satoshi
```

61 E2E tests covering all 34 server tools against Juice Shop (port 3000) and bWAPP (port 80).
Metasploit tests require `msfrpcd` running on port 55553.

## Project structure

| File | Purpose |
|------|---------|
| `index.ts` | CLI entry point — one-shot commands, REPL with tab completion |
| `src/config.ts` | Shared config — server binary + config paths (env-overridable) |
| `src/client/mcp-client.ts` | High-level MCP client — handshake, tool listing/caching, tool calls |
| `src/client/transport.ts` | Stdio transport — JSON-RPC over stdin/stdout, timeouts, stderr capture, notification dispatch, config env injection |
| `src/client/helpers.ts` | Typed wrappers — finding CRUD, scan management, report generation |
| `src/commands/scan.ts` | REPL scan subcommand dispatcher |
| `src/commands/finding.ts` | REPL finding subcommand dispatcher |
| `src/types/jsonrpc.ts` | JSON-RPC 2.0 types + notification type |
| `src/types/mcp.ts` | MCP protocol types + logging notification params |
| `src/types/finding.ts` | Finding and severity types |
| `src/types/scan.ts` | Scan status and parameter types |
| `src/client/mcp-client.test.ts` | Integration tests — handshake, tools, findings, scans, caching, errors |
| `src/client/helpers.test.ts` | Helper layer tests — typed finding/scan wrappers |
| `tests/e2e/` | E2E tests — all 34 tools against Docker targets (6 files, 61 tests) |

See [docs/architecture.md](docs/architecture.md) for the layered architecture and data flow.

## License

[MIT](LICENSE)
