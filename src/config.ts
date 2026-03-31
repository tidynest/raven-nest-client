// src/config.ts
// Shared configuration constants used by both the CLI and test suites.

// Server binary path - override with RAVEN_SERVER env var
export const SERVER_BIN = process.env.RAVEN_SERVER
    ?? `${process.env.HOME}/RustroverProjects/raven-nest-mcp/target/release/raven-server`;

// Server config path - derived from the binary location so it resolves
// correctly regardless of the client's CWD. The binary lives at
// <server-project>/target/release/raven-server, config at <server-project>/config/default.toml.
// Override with RAVEN_CONFIG env var.
import { resolve, dirname } from "path";
export const SERVER_CONFIG = process.env.RAVEN_CONFIG
    ?? resolve(dirname(SERVER_BIN), "..", "..", "config", "default.toml");
