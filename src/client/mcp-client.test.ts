// src/client/mcp-client.test.ts
// Integration tests - spawns the real Rust MCP server and verifies
// the full JSON-RPC pipeline: handshake, tool discovery, tool invocation,
// finding CRUD, report generation, scan lifecycle, caching, and error handling.

import { describe, test, expect, afterAll } from "bun:test";
import { McpClient } from "./mcp-client";
import { SERVER_BIN } from "../config";

// -- Core handshake and tool discovery ------------------------------------

describe("McpClient", () => {
    const client = new McpClient(SERVER_BIN);

    // Holds the handshake result so later tests can reference it
    let handshake: Awaited<ReturnType<McpClient["connect"]>>;

    test("connects and completes handshake", async () => {
        handshake = await client.connect();

        // Verify the server returned expected protocol metadata
        expect(handshake.protocolVersion).toBe("2025-03-26");
        expect(handshake.serverInfo.name).toBe("rmcp");
        expect(handshake.serverInfo.version).toMatch("1.1.0");
        expect(handshake.capabilities).toHaveProperty("tools");
    });

    test("lists tools after handshake", async () => {
        const { tools } = await client.listTools();

        // The server should expose at least 21 tools.
        // Each tool has name, description, and an inputSchema.
        expect(tools.length).toBeGreaterThan(21);
        expect(tools.map(t => t.name)).toContain("ping_target");
        expect(tools[0]).toHaveProperty("inputSchema");
    });

    test("calls ping_target", async () => {
        const result = await client.callTool("ping_target", { target: "127.0.0.1" } );

        // The first content block should contain the ping output
        // including the target address we pinged
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.content[0]!.type).toBe("text");
        expect(result.content[0]!.text).toContain("127.0.0.1");
        expect(result.isError).toBe(false);
    });

    afterAll(async () => {
        await client.disconnect();
    });
});

// -- Finding CRUD lifecycle -----------------------------------------------

describe("Findings CRUD", () => {
    const client = new McpClient(SERVER_BIN);

    // Shared state: save_finding returns an ID that later tests need
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

        // Server responds with "Finding saved. ID: <uuid>" - extract the UUID
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

        // Verify the returned text contains the title and normalised severity
        expect(result.isError).toBe(false);
        expect(result.content[0]!.text).toContain("Test XSS in login form");
        expect(result.content[0]!.text).toContain("High");
    });

    test("lists findings including the saved one", async () => {
        const result = await client.callTool("list_findings", {});

        // The listing should include our finding's UUID
        expect(result.isError).toBe(false);
        expect(result.content[0]!.text).toContain(findingId);
    });

    test("deletes the finding", async () => {
        const result = await client.callTool("delete_finding", {
            finding_id: findingId,
        });

        // Server confirms deletion with "deleted" in the response
        expect(result.isError).toBe(false);
        expect(result.content[0]!.text.toLowerCase()).toContain("deleted");
    });

    afterAll(async () => {
        await client.disconnect();
    });
});

// -- Report generation ----------------------------------------------------

describe("Report generation", () => {
    const client = new McpClient(SERVER_BIN);
    let findingId: string;

    test("connects", async () => {
        await client.connect();
    });

    test("generates report", async () => {
        const result = await client.callTool("generate_report", {});

        // Even with no findings, the server should produce a report file
        expect(result.isError).toBe(false);
        expect(result.content[0]!.text).toContain("Report saved to:");
    });

    test("generates report including saved finding", async () => {
        // Save a critical finding so the report has content to include
        const saved = await client.callTool("save_finding", {
            title:       "SQL injection in search",
            severity:    "critical",
            description: "Unsanitised input in search query parameter",
            target:      "127.0.0.1:8080",
            tool:        "sqlmap",
        });
        findingId = saved.content[0]!.text.match(/ID: (.+)/)![1]!;

        const result = await client.callTool("generate_report", {});

        // Report should reflect the critical severity finding
        expect(result.isError).toBe(false);
        expect(result.content[0]!.text).toContain("critical");
    });

    test("cleans up finding", async () => {
        // Remove the test finding to avoid polluting other test suites
        await client.callTool("delete_finding", { finding_id: findingId });
    });

    afterAll(async () => {
        await client.disconnect();
    });
});

// -- Tool list caching behaviour ------------------------------------------

describe("Tool list caching", () => {
    const client = new McpClient(SERVER_BIN);

    test("connects", async () => {
        await client.connect();
    });

    test("returns cached result on second listTools call", async () => {
        const first = await client.listTools();
        const second = await client.listTools();

        // Same array reference means the cache was used (no re-fetch)
        expect(second.tools).toBe(first.tools);
    });

    test("refreshTools re-fetches from server", async () => {
        const cached = await client.listTools();
        const fresh = await client.refreshTools();

        // Different array reference confirms new data from server
        expect(fresh.tools).not.toBe(cached.tools);
        // But content should be identical since tools haven't changed
        expect(fresh.tools.length).toBe(cached.tools.length);
    });

    afterAll(async () => {
        await client.disconnect();
    });
});

// -- Background scan lifecycle --------------------------------------------

describe("Scan lifecycle", () => {
    const client = new McpClient(SERVER_BIN);
    let scanId: string;

    test("connects", async () => {
        await client.connect();
    });

    test("launches a background scan", async () => {
        const result = await client.callTool("launch_scan", {
            tool:   "nmap",
            target: "127.0.0.1",
        });

        expect(result.isError).toBe(false);
        expect(result.content[0]!.text).toContain("Scan launched");

        // Extract the scan UUID from "Scan launched. ID: <uuid>"
        const match = result.content[0]!.text.match(/ID: ([a-f0-9-]+)/);
        expect(match).not.toBeNull();
        scanId = match![1]!;
    });

    test("gets scan status", async () => {
        const result = await client.callTool("get_scan_status", { scan_id: scanId });

        // Status should be non-empty (Running, Completed, etc.)
        expect(result.isError).toBe(false);
        expect(result.content[0]!.text.length).toBeGreaterThan(0);
    });

    test("lists scans including the launched one", async () => {
        const result = await client.callTool("list_scans", {});

        // Our scan's UUID should appear in the listing
        expect(result.isError).toBe(false);
        expect(result.content[0]!.text).toContain(scanId);
    });

    test("cancels the scan", async () => {
        const result = await client.callTool("cancel_scan", { scan_id: scanId });

        expect(result.isError).toBe(false);
    });

    afterAll(async () => {
        await client.disconnect();
    });
});

// -- Extended tool tests with optional fields -----------------------------

describe("Additional tool tests", () => {
    const client = new McpClient(SERVER_BIN);
    let findingId: string;

    test("connects", async () => {
        await client.connect();
    });

    test("save_finding with all optional fields", async () => {
        // Test that every optional field is accepted and persisted
        const result = await client.callTool("save_finding", {
            title:          "Full-field test finding",
            severity:       "medium",
            description:    "Testing all optional fields",
            target:         "192.168.1.1",
            tool:           "manual",
            evidence:       "HTTP/1.1 500 Internal Server Error",
            remediation:    "Sanitise input parameters",
            cvss:           6.5,
            cve:            "CVE-2024-1234",
            owasp_category: "A03:2021 Injection",
        });

        expect(result.isError).toBe(false);
        const match = result.content[0]!.text.match(/ID: (.+)/);
        expect(match).not.toBeNull();
        findingId = match![1]!;
    });

    test("get_finding returns all saved fields", async () => {
        const result = await client.callTool("get_finding", { finding_id: findingId });

        // Verify every optional field was round-tripped through the server
        const text = result.content[0]!.text;
        expect(text).toContain("Full-field test finding");
        expect(text).toContain("CVE-2024-1234");
        expect(text).toContain("A03:2021 Injection");
        expect(text).toContain("6.5");
    });

    test("generate_report with custom title", async () => {
        const result = await client.callTool("generate_report", {
            title: "Custom Test Report",
        });

        expect(result.isError).toBe(false);
        expect(result.content[0]!.text).toContain("Report saved to:");
    });

    test("cleans up finding", async () => {
        // Remove test data so it doesn't bleed into other test suites
        await client.callTool("delete_finding", { finding_id: findingId });
    });

    afterAll(async () => {
        await client.disconnect();
    });
});

// -- Error handling and edge cases ----------------------------------------

describe("Error handling", () => {
    const client = new McpClient(SERVER_BIN);

    test("connects", async () => {
        await client.connect();
    });

    test("rejects nonexistent tool", async () => {
        // Calling a tool that doesn't exist should throw with "tool not found"
        try {
            await client.callTool("nonexistent_tool", {});
            expect().fail("should have thrown");
        } catch (err) {
            expect((err as Error).message).toContain("tool not found");
        }
    });

    test("rejects missing required params", async () => {
        // ping_target requires a "target" param - omitting it should throw
        try {
            await client.callTool("ping_target", {});
            expect().fail("should have thrown");
        } catch (err) {
            expect((err as Error).message).toContain("missing field");
        }
    });

    test("handles get_finding with invalid ID gracefully", async () => {
        const result = await client.callTool("get_finding", { finding_id: "not-a-real-id"} );

        // Server returns a content response (not a JSON-RPC error) for invalid IDs
        expect(result.content.length).toBeGreaterThan(0);
    });

    afterAll(async () => {
        await client.disconnect();
    });
});
