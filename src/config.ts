// src/config.ts
// Shared configuration constants used by both the CLI and test suites.

import { resolve, dirname } from "path";

// How to launch the MCP server. RAVEN_SERVER may be either:
//   • a path to a `raven-server` binary, e.g. /opt/raven/raven-server, or
//   • a full launch command, e.g.
//     "docker run --rm -i ghcr.io/tidynest/raven-nest-mcp:latest"
// (whitespace-separated; a path containing spaces still works as long as the whole
// string is a real file — see transport.ts. Quoted args inside a command aren't
// supported; use a wrapper script if you need them.)
//
// Default: a sibling `raven-nest-mcp` checkout's release build, resolved relative
// to this file so it works regardless of the client's CWD. Override for any other
// layout — or to drive the published image — with RAVEN_SERVER.
const DEFAULT_SERVER = resolve(
    import.meta.dir, "..", "..", "raven-nest-mcp", "target", "release", "raven-server",
);
export const SERVER_BIN = process.env.RAVEN_SERVER ?? DEFAULT_SERVER;

// Server config path. Only meaningful when the server is a local binary: derived
// from the binary location (<server-project>/config/default.toml) so the server
// picks up tool_paths/sudo_tools/Metasploit regardless of CWD. For a wrapper
// command (e.g. docker) the server resolves its own config inside the container,
// so this stays undefined. Override with RAVEN_CONFIG.
const looksLikePath = !SERVER_BIN.includes(" ") && SERVER_BIN.includes("/");
export const SERVER_CONFIG: string | undefined = process.env.RAVEN_CONFIG
    ?? (looksLikePath
        ? resolve(dirname(SERVER_BIN), "..", "..", "config", "default.toml")
        : undefined);
