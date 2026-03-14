// src/client/mcp-client.test.ts
// Integration tests — spawns the real Rust MCP server and verifies
// the full JSON-RPC pipeline: handshake, tool discovery, and teardown.

import { describe, test, expect, afterAll } from "bun:test";
import { McpClient } from "./mcp-client";

const SERVER_BIN = process.env.RAVEN_SERVER
    ?? `${process.env.HOME}/RustroverProjects/raven-nest-mcp/target/release/raven-server`;

describe("McpClient", () => {
    const client = new McpClient(SERVER_BIN);

    // Holds the handshake result so later tests can reference it
    let handshake: Awaited<ReturnType<McpClient["connect"]>>;

    test("connects and completes handshake", async () => {
        handshake = await client.connect();

        // Assert the handshake result.
        expect(handshake.protocolVersion).toBe("2025-03-26");
        expect(handshake.serverInfo.name).toBe("rmcp");
        expect(handshake.serverInfo.version).toMatch("1.1.0");
        expect(handshake.capabilities).toHaveProperty("tools");
    });

    test("lists tools after handshake", async () => {
        const { tools } = await client.listTools();

        // Assert the tool list.
        // `tools` is an array of { name, description, inputSchema }.
        expect(tools.length).toBeGreaterThan(21);
        expect(tools.map(t => t.name)).toContain("ping_target");
        expect(tools[0]).toHaveProperty("inputSchema");
    });

    test("calls ping_target", async () => {
        const result = await client.callTool("ping_target", { target: "127.0.0.1" } );

        // Assert the tool call result.
        // `content` is an array of TextContent blocks; the first should contain the ping output.
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.content[0]!.type).toBe("text");
        expect(result.content[0]!.text).toContain("127.0.0.1");
        expect(result.isError).toBe(false);
    });

    afterAll(async () => {
        await client.disconnect();
    });
});
