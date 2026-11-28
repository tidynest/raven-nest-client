// src/config.test.ts
// Which RAVEN_CONFIG the client hands the server. Servers after 0.4.2 refuse to
// start on a RAVEN_CONFIG that names a missing file, so the guessed path must
// only be passed on when the file is there.

import { describe, test, expect } from "bun:test";
import { resolveServerConfig } from "./config";

const BIN = "/srv/raven-nest-mcp/target/release/raven-server";
const GUESS = "/srv/raven-nest-mcp/config/default.toml";
const present = () => true;
const absent = () => false;

describe("resolveServerConfig", () => {
    test("guesses the server project's config when that file exists", () => {
        expect(resolveServerConfig(BIN, undefined, present)).toBe(GUESS);
    });

    test("passes nothing when the guessed file is missing", () => {
        expect(resolveServerConfig(BIN, undefined, absent)).toBeUndefined();
    });

    test("passes an explicit RAVEN_CONFIG on without checking it", () => {
        expect(resolveServerConfig(BIN, "/etc/raven.toml", absent)).toBe("/etc/raven.toml");
    });

    test("never guesses for a wrapper command or a bare name", () => {
        const docker = "docker run --rm -i ghcr.io/tidynest/raven-nest-mcp:latest";
        expect(resolveServerConfig(docker, undefined, present)).toBeUndefined();
        expect(resolveServerConfig("raven-server", undefined, present)).toBeUndefined();
    });
});
