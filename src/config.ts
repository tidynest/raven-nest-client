// src/config.ts
// Shared configuration constants used by both the CLI and test suites.

import { existsSync } from "node:fs";
import { resolve, dirname } from "path";

// How to launch the MCP server. RAVEN_SERVER may be either:
//   • a path to a `raven-server` binary, e.g. /opt/raven/raven-server, or
//   • a full launch command, e.g.
//     "docker run --rm -i ghcr.io/tidynest/raven-nest-mcp:latest"
// (whitespace-separated; a path containing spaces still works as long as the whole
// string is a real file - see transport.ts. Quoted args inside a command aren't
// supported; use a wrapper script if you need them.)
//
// Default: a sibling `raven-nest-mcp` checkout's release build, resolved relative
// to this file so it works regardless of the client's CWD. Override for any other
// layout - or to drive the published image - with RAVEN_SERVER.
const DEFAULT_SERVER = resolve(
    import.meta.dir, "..", "..", "raven-nest-mcp", "target", "release", "raven-server",
);
export const SERVER_BIN = process.env.RAVEN_SERVER ?? DEFAULT_SERVER;

// Work out which config path, if any, to hand the server as RAVEN_CONFIG.
//
// An explicit RAVEN_CONFIG always wins and is passed on unchecked, so the
// server reports a wrong path itself. Otherwise, for a local binary, guess
// <server-project>/config/default.toml from the binary location, so the server
// picks up tool_paths, sudo_tools and Metasploit settings regardless of CWD.
//
// The guess is used only when that file exists. Servers after 0.4.2 refuse to
// start on a RAVEN_CONFIG that names a missing file, so a wrong guess would
// stop them. With no guess the server runs its own lookup. A wrapper command
// such as docker never gets a guess, because the path would be a host path.
export function resolveServerConfig(
    serverBin: string,
    explicit: string | undefined,
    exists: (path: string) => boolean = existsSync,
): string | undefined {
    if (explicit !== undefined) return explicit;
    const looksLikePath = !serverBin.includes(" ") && serverBin.includes("/");
    if (!looksLikePath) return undefined;
    const guess = resolve(dirname(serverBin), "..", "..", "config", "default.toml");
    return exists(guess) ? guess : undefined;
}

export const SERVER_CONFIG = resolveServerConfig(SERVER_BIN, process.env.RAVEN_CONFIG);
