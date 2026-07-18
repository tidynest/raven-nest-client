# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions track the raven-nest-mcp server's feature line; client-only fixes bump the patch.

## [0.2.8] - 2026-07-18

Lockstep release tracking raven-nest-mcp 0.2.8. No client-side wire or tool
changes. Server-side additions: a NetExec output parser (completing structured
parser coverage across all 22 tools) and `serverInfo.name` aligned to the MCP
registry name. Adds status badges to the README.

## [0.2.7] — 2026-07-16

Client-only maintenance release: correctness fixes plus a dead-code and
duplication sweep. No change to the server wire protocol or tool surface.

### Fixed
- `coerceArgs`: an empty value on a numeric field (e.g. a stray `port=`) no longer
  coerces to `0` via `Number("")`. Empty/whitespace input is kept as the raw string
  so the server validates and reports it instead of silently receiving `0`.
- `tokenize`: a backslash now escapes a following quote character
  (`title="SQL \"injection\""` → `title=SQL "injection"`). Other backslashes stay
  literal, so Windows paths and regex in finding values survive intact.
- `McpClient.connect`: the server's negotiated `protocolVersion` is checked against
  the version the client implements, failing fast with a clear error on mismatch
  instead of proceeding over an unknown wire contract.
- MCP `clientInfo` handshake reports the package version.

### Changed
- Deduplicated the `list` / `call` / `describe` logic shared by the CLI and REPL into
  `runList` / `runCall` / `runDescribe`.
- Folded the repeated `name=<number>` scan-option parsing into a single `numOpt()` helper.
- Transport reads server stderr via `stderr: "inherit"`, so diagnostics reach the
  terminal and the kernel drains the pipe (a chatty tool can't block).
- Guarded `main()` with `import.meta.main` and exported `tokenize` / `coerceArgs`, so the
  pure tests import the shipped functions instead of copy-pasted duplicates.

### Removed
- Unused types: all of `src/types/scan.ts`, `Finding` / `Severity`, and
  `ClientCapabilities` / `LogLevel` / `LoggingNotificationParams`.
- The unread stderr-capture buffer and `getStderr()`, `McpClient.refreshTools()`, and
  the redundant `src/client/index.ts` barrel. Net ~200 fewer source lines, no behaviour change.

## [0.2.6] and earlier

Prior releases tracked raven-nest-mcp server feature parity in lockstep. See the git
history (`git log`, tag `v0.2.6`) and `PROGRESS.md` (steps 1–48) for the full record.

[0.2.7]: https://gitlab.com/tidynest/raven-nest-client/-/compare/v0.2.6...v0.2.7
