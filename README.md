# raven-nest-client

TypeScript MCP client for [raven-nest-mcp](https://github.com/tidynest/raven-nest-mcp).
Speaks JSON-RPC 2.0 over stdio to the Rust MCP server.

## Requirements

- [Bun](https://bun.sh) v1.3+
- The compiled `raven-server` binary from raven-nest-mcp

## Setup

```bash
bun install
```

By default the client looks for the server binary at
`~/RustroverProjects/raven-nest-mcp/target/release/raven-server`.
Override with the `RAVEN_SERVER` env var or a `.env` file:

```bash
RAVEN_SERVER=/path/to/raven-server
```

## Usage

**Interactive REPL** (no args):
```bash
bun run index.ts
```
Commands: `list`, `call <tool> [key=value ...]`, `describe <tool>`, `help`, `quit`

**List available tools:**
```bash
bun run index.ts list
```

**Call a tool:**
```bash
bun run index.ts call ping_target target=127.0.0.1
```

## Tests

```bash
bun test
```

Runs integration tests against the real server (16 tests, 28 assertions).

## Project structure

| File | Purpose |
|------|---------|
| `index.ts` | CLI entry point — one-shot commands and interactive REPL |
| `src/client/mcp-client.ts` | High-level MCP client — handshake, tool listing, tool calls |
| `src/client/transport.ts` | Stdio transport — spawns server, JSON-RPC over stdin/stdout |
| `src/types/jsonrpc.ts` | JSON-RPC 2.0 type definitions |
| `src/types/mcp.ts` | MCP protocol type definitions |

## License

[MIT](LICENSE)
