# raven-nest-client

TypeScript MCP client for [raven-nest-mcp](https://github.com/tidynest/raven-nest-mcp).
Speaks JSON-RPC 2.0 over stdio to the Rust MCP server (43 tools). Drives either a
local `raven-server` build or the published Docker image. **Versioned in lockstep
with the server** — client and server always share the same version number, so a
client `vX.Y.Z` pairs with server `vX.Y.Z`.

## Requirements

- [Bun](https://bun.sh) v1.3+
- A `raven-server` to talk to — **either** a local build from
  [raven-nest-mcp](https://github.com/tidynest/raven-nest-mcp), **or** Docker (to run
  the published image — no local build needed)

## Setup

```bash
bun install
```

By default the client looks for a sibling `raven-nest-mcp` checkout's release build
(`../raven-nest-mcp/target/release/raven-server`, resolved relative to the client —
not your CWD). For a local binary the server's config is auto-derived from its
location (`<server-project>/config/default.toml`), so `tool_paths`, `sudo_tools`,
and Metasploit integration work regardless of where you run the client.

`RAVEN_SERVER` can be a binary path **or a full launch command** — set it (or use a
`.env` file) to point elsewhere, or to run the published Docker image:

```bash
# a local binary in another location
RAVEN_SERVER=/path/to/raven-server
RAVEN_CONFIG=/path/to/config/default.toml          # optional; only for local binaries

# …or the published image (bundles all 22 tools — no local build needed)
RAVEN_SERVER="docker run --rm -i ghcr.io/tidynest/raven-nest-mcp:latest"
```

With the Docker command the server uses the config baked into the image; the client
skips `RAVEN_CONFIG` injection automatically.

## Standalone binary (optional)

Bundle the client and the Bun runtime into a single executable — useful for
handing the client to a machine without Bun installed:

```bash
bun run compile      # -> ./raven-nest-client (~100 MB, includes the Bun runtime)
./raven-nest-client list
```

It still needs the `raven-server` binary present (see [Requirements](#requirements)).

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

### Quick start

A typical REPL session — connect, scope to an engagement, record a finding, export:

```text
$ bun run index.ts
raven> call ping_target target=127.0.0.1      # invoke any server tool
raven> engagement set acme                     # scope findings + reports to "acme"
raven (acme)> finding save title="XSS in login" severity=high target=127.0.0.1 tool=manual
raven (acme)> report format=html               # write the report (see path below)
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
| | `report [title=...] [format=...]` | Generate a report (md/json/sarif/html) |
| **Engagement** | `engagement set <name>` | Switch/create the active engagement |
| | `engagements` | List engagements (active marked) |
| **Workflows** | `recon <target>` | nmap discovery → whatweb on the web ports found |
| **Session** | `help` | Show available commands |
| | `quit` | Exit the REPL |

Tab completion is available for tool names (after `call` or `describe`) and command names.

**Engagements** scope findings and reports to a named client or target: `engagement set <name>` switches context, and everything saved afterwards belongs to that engagement (the prompt shows it, e.g. `raven (acme)>`). The active engagement lives in server memory — it resets when the server restarts, and the prompt drops the `(name)` suffix.

### Server tools (43)

**Recon:** ping_target, run_nmap, run_whatweb, run_nuclei, run_nikto, run_subfinder, run_dnsrecon, run_wpscan, run_masscan, run_httpx, run_dnsx, run_katana

**Exploitation:** run_sqlmap, run_hydra, run_feroxbuster, run_ffuf, run_testssl, run_enum4linux_ng, run_john, run_dalfox, run_netexec

**Secrets (2):** run_gitleaks, run_trufflehog — scan a filesystem path (confined to the server's `output_dir`, `/usr/share`, `/usr/lib`); report location + rule id only, never the secret value

**Metasploit (6):** msf_search, msf_module_info, msf_exploit, msf_auxiliary, msf_sessions, msf_post

**Utility:** http_request

**Background scans (5):** launch_scan, get_scan_status, get_scan_results, cancel_scan, list_scans

**Findings (6):** save_finding, get_finding, list_findings, list_findings_by_scan, delete_finding, generate_report

**Engagement (2):** set_engagement, list_engagements

Reports are multi-format: `generate_report` defaults to Markdown; pass `format=json|sarif|html` (e.g. `report format=sarif`) for the other formats.
Files are written under the server's `output_dir` (default `/tmp/raven-nest`), or `{output_dir}/engagements/{name}/` when an engagement is active. The server prints the saved path in its response.

**Scope enforcement:** when the server has an engagement `[scope]` allowlist enabled, every tool — including `http_request` — rejects out-of-scope hosts with an authorization error (MCP `-32600`). The client surfaces the message verbatim and does not retry; treat it as a hard boundary.

## Tests

**Integration tests** (no Docker needed):
```bash
bun test src/
```
42 tests, 57 assertions — handshake, tool calls, finding CRUD, scan lifecycle, engagement scoping, caching, errors.

**E2E tests** (require Docker targets + server config):
```bash
# Start targets
docker start juice-shop infallible_satoshi

# Run individual phases (execution order matters)
bun test tests/e2e/phase1-pure.test.ts                # pure functions, no server
bun test tests/e2e/phase2-repl.test.ts                # REPL code paths
bun test tests/e2e/phase5-edge.test.ts                # edge cases
bun test tests/e2e/phase3-security.test.ts            # nmap, whatweb, nikto, nuclei
bun test tests/e2e/phase3b-remaining-tools.test.ts    # all other tools + secret scanners + Metasploit
bun test tests/e2e/phase4-progress.test.ts            # progress/stderr separation

# Stop targets
docker stop juice-shop infallible_satoshi
```

70 E2E tests covering 36 of the server tools against Juice Shop (port 3000) and bWAPP (port 80), plus local filesystem fixtures for the secret scanners (gitleaks, trufflehog) and pure-function tests for the recon parser, tokenizer, and arg coercion.
Metasploit tests require `msfrpcd` running on port 55553.

## Project structure

| File | Purpose |
|------|---------|
| `index.ts` | CLI entry point — one-shot commands, REPL with tab completion |
| `src/config.ts` | Shared config — server binary + config paths (env-overridable) |
| `src/client/mcp-client.ts` | High-level MCP client — handshake, tool listing/caching, tool calls |
| `src/client/transport.ts` | Stdio transport — JSON-RPC over stdin/stdout, timeouts, stderr capture, notification dispatch, config env injection |
| `src/client/helpers.ts` | Typed wrappers — finding CRUD, scan management, engagement scoping, report generation |
| `src/commands/scan.ts` | REPL scan subcommand dispatcher |
| `src/commands/finding.ts` | REPL finding subcommand dispatcher |
| `src/commands/engagement.ts` | REPL engagement subcommand dispatcher |
| `src/commands/recon.ts` | Recon workflow — nmap discovery → whatweb on web ports (deterministic pipeline) |
| `src/types/jsonrpc.ts` | JSON-RPC 2.0 types + notification type |
| `src/types/mcp.ts` | MCP protocol types + logging notification params |
| `src/types/finding.ts` | `SaveFindingParams` — the save_finding request shape |
| `src/types/scan.ts` | Scan status and parameter types |
| `src/client/mcp-client.test.ts` | Integration tests — handshake, tools, findings, scans, caching, errors |
| `src/client/helpers.test.ts` | Helper layer tests — typed finding/scan wrappers |
| `src/commands/engagement.test.ts` | Engagement command tests — set → active → list round-trip |
| `tests/e2e/` | E2E tests — 36 tools against Docker targets + filesystem fixtures (6 files, 70 tests) |

See [docs/architecture.md](docs/architecture.md) for the layered architecture and data flow.

## License

[MIT](LICENSE)
