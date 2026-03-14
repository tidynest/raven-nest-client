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

describe("Findings CRUD", () => {
    const client = new McpClient(SERVER_BIN);

    // Shared state - save_finding returns an ID that later tests need
    let findingId: string;

    test("connects", async () => {
        await client.connect();
    });

    test("saves a finding", async () => {
        const result = await client.callTool("save_finding", {
            title:          "Test XSS in login form",
            severity:       "high",
            description:    "Reflected XSS via username parameter",
            target:         "127.0.0.1",
            tool:           "manual",
        });

        // Extract the UUID from "Finding saved. ID: <uuid>"
        const match = result.content[0]!.text.match(/ID: (.+)/);
        expect(match).not.toBeNull();
        findingId = match![1]!;
        expect(result.isError).toBe(false);
        expect(result.content.length).toBeGreaterThan(0);
    });

    test("retrieves the finding by ID", async () => {
        const result = await client.callTool("get_finding", {
            finding_id: findingId,
        });

        expect(result.isError).toBe(false);
        expect(result.content[0]!.text).toContain("Test XSS in login form");
        expect(result.content[0]!.text).toContain("High");
    });

    test("lists findings including the saved one", async () => {
        const result = await client.callTool("list_findings", {});

        expect(result.isError).toBe(false);
        expect(result.content[0]!.text).toContain(findingId);
    });

    test("deletes the finding", async () => {
        const result = await client.callTool("delete_finding", {
            finding_id: findingId,
        });

        expect(result.isError).toBe(false);
        expect(result.content[0]!.text.toLowerCase()).toContain("deleted");
    });

    afterAll(async () => {
        await client.disconnect();
    });
});

describe("Report generation", () => {
    const client = new McpClient(SERVER_BIN);
    let findingId: string;

    test("connects", async () => {
        await client.connect();
    });

    test("generates report", async () => {
        const result = await client.callTool("generate_report", {});

        expect(result.isError).toBe(false);
        expect(result.content[0]!.text).toContain("Report saved to:");
    });

    test("generates report including saved finding", async () => {
        const saved = await client.callTool("save_finding", {
            title:       "SQL injection in search",
            severity:    "critical",
            description: "Unsanitised input in search query parameter",
            target:      "127.0.0.1:8080",
            tool:        "sqlmap",
        });
        findingId = saved.content[0]!.text.match(/ID: (.+)/)![1]!;

        const result = await client.callTool("generate_report", {});

        expect(result.isError).toBe(false);
        expect(result.content[0]!.text).toContain("critical");
    });

    test("cleans up finding", async () => {
        await client.callTool("delete_finding", { finding_id: findingId });
    });

    afterAll(async () => {
        await client.disconnect();
    });
});

describe("Error handling", () => {
    const client = new McpClient(SERVER_BIN);

    test("connects", async () => {
        await client.connect();
    });

    test("rejects nonexistent tool", async () => {
        try {
            await client.callTool("nonexistent_tool", {});
            expect().fail("should have thrown");
        } catch (err) {
            expect((err as Error).message).toContain("tool not found");
        }
    });

    test("rejects missing required params", async () => {
        try {
            await client.callTool("ping_target", {});
            expect().fail("should have thrown");
        } catch (err) {
            expect((err as Error).message).toContain("missing field");
        }
    });

    test("handles get_finding with invalid ID gracefully", async () => {
        const result = await client.callTool("get_finding", { finding_id: "not-a-real-id"} );

        // Server returns a response (not an error) for invalid IDs
        expect(result.content.length).toBeGreaterThan(0);
    });

    afterAll(async () => {
        await client.disconnect();
    });
});
