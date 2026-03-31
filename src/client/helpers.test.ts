// src/client/helpers.test.ts
// Integration tests for RavenHelpers - verifies the typed convenience
// wrappers produce correct results against the real Rust MCP server.
// Covers finding CRUD, report generation, and scan operations.

import { describe, test, expect, afterAll } from "bun:test";
import { McpClient } from "./mcp-client";
import { RavenHelpers } from "./helpers";
import { SERVER_BIN } from "../config";

// -- Finding helper methods -----------------------------------------------

describe("RavenHelpers - findings", () => {
    const client = new McpClient(SERVER_BIN);
    const helpers = new RavenHelpers(client);

    // Shared finding ID populated by saveFinding, used by later tests
    let findingId: string;

    test("connects", async () => {
        await client.connect();
    });

    test("saveFinding returns a UUID", async () => {
        findingId = await helpers.saveFinding({
            title:       "Helper test finding",
            severity:    "low",
            description: "Testing the typed helper layer",
            target:      "10.0.0.1",
            tool:        "manual",
        });

        // Verify the returned string is a valid UUID v4 format
        expect(findingId).toMatch(/^[a-f0-9-]{36}$/);
    });

    test("getFinding returns finding text", async () => {
        const text = await helpers.getFinding(findingId);

        // Server should return the title and normalised severity
        expect(text).toContain("Helper test finding");
        expect(text).toContain("Low");
    });

    test("listFindings includes the saved finding", async () => {
        const text = await helpers.listFindings();

        // The UUID should appear in the full listing
        expect(text).toContain(findingId);
    });

    test("deleteFinding returns true for existing finding", async () => {
        const deleted = await helpers.deleteFinding(findingId);

        expect(deleted).toBe(true);
    });

    test("deleteFinding returns false for nonexistent finding", async () => {
        // Deleting an ID that doesn't exist should return false, not throw
        const deleted = await helpers.deleteFinding("nonexistent-id");

        expect(deleted).toBe(false);
    });

    test("generateReport returns report text", async () => {
        const text = await helpers.generateReport();

        // Report should indicate where the file was saved
        expect(text).toContain("Report saved to:");
    });

    afterAll(async () => {
        await client.disconnect();
    });
});

// -- Scan helper methods --------------------------------------------------

describe("RavenHelpers - scans", () => {
    const client = new McpClient(SERVER_BIN);
    const helpers = new RavenHelpers(client);

    test("connects", async () => {
        await client.connect();
    });

    test("launchScan returns scan info", async () => {
        const text = await helpers.launchScan("nmap", "127.0.0.1");

        // Server should confirm the scan was launched
        expect(text).toContain("Scan launched");
    });

    test("listScans returns scan list", async () => {
        const text = await helpers.listScans();

        // At least the scan we just launched should appear
        expect(text.length).toBeGreaterThan(0);
    });

    afterAll(async () => {
        await client.disconnect();
    });
});
