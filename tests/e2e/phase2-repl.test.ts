// Phase 2: REPL code paths via direct import (server required)
// Exercises the same functions the REPL uses, bypassing readline.

import { describe, test, expect, afterAll, spyOn } from "bun:test";
import { McpClient } from "../../src/client/mcp-client";
import { RavenHelpers } from "../../src/client/helpers";
import { handleFindingCommand, parseArgs } from "../../src/commands/finding";
import { handleScanCommand } from "../../src/commands/scan";
import { SERVER_BIN } from "../../src/config";

// -- Inlined from index.ts (can't import without triggering main()) --

function tokenize(line: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let quote = "";
    for (const ch of line) {
        if (quote) {
            if (ch === quote) { quote = ""; } else { current += ch; }
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === " ") {
            if (current) { tokens.push(current); current = ""; }
        } else {
            current += ch;
        }
    }
    if (current) tokens.push(current);
    return tokens;
}

function coerceArgs(raw: Record<string, string>, tool: { inputSchema: { properties?: Record<string, unknown> } }): Record<string, unknown> {
    const props = tool.inputSchema.properties ?? {};
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
        const schema = props[key] as Record<string, unknown> | undefined;
        if (!schema) { result[key] = value; continue; }
        const typeVal = schema.type;
        const types: string[] = Array.isArray(typeVal) ? typeVal : String(typeVal ?? "string").split(",").map(t => t.trim());
        if (types.includes("number") || types.includes("integer")) {
            const num = Number(value);
            result[key] = isNaN(num) ? value : num;
        } else if (types.includes("boolean")) {
            result[key] = value === "true";
        } else {
            result[key] = value;
        }
    }
    return result;
}

// No-colour map for testing (empty strings = no ANSI codes)
const c: Record<string, string> = {
    name: "", dim: "", label: "", err: "", ok: "", prompt: "", reset: "",
};

describe("Phase 2: REPL Code Paths", () => {
    const client = new McpClient(SERVER_BIN);
    const helpers = new RavenHelpers(client);

    test("connects to server", async () => {
        await client.connect();
    });

    // -- Test 2a: REPL call path with coerceArgs --

    test("2a: call path with coerceArgs", async () => {
        const parts = tokenize("call ping_target target=127.0.0.1 count=2");
        expect(parts).toEqual(["call", "ping_target", "target=127.0.0.1", "count=2"]);

        const rawArgs = parseArgs(parts.slice(2));
        expect(rawArgs).toEqual({ target: "127.0.0.1", count: "2" });

        const { tools } = await client.listTools();
        const toolDef = tools.find(t => t.name === "ping_target")!;
        expect(toolDef).toBeDefined();

        const args = coerceArgs(rawArgs, toolDef);
        expect(args.count).toBe(2);
        expect(typeof args.count).toBe("number");

        const result = await client.callTool("ping_target", args);
        expect(result.isError).toBe(false);
        expect(result.content[0]!.text).toContain("127.0.0.1");
    }, 30_000);

    // -- Test 2b: finding save with quoted multi-word values --

    test("2b: finding save with quoted multi-word values", async () => {
        const line = 'finding save title="SQL Injection in Login Form" severity=critical description="Reflected XSS via username" target=127.0.0.1:3000 tool=manual cvss=9.1';
        const parts = tokenize(line);

        // Verify tokenisation preserved multi-word title
        expect(parts[2]).toBe("title=SQL Injection in Login Form");

        // Capture console.log to extract saved ID
        const spy = spyOn(console, "log");
        await handleFindingCommand(helpers, parts, c);

        const savedCall = spy.mock.calls.find(call => String(call[0]).includes("Saved:"));
        expect(savedCall).toBeDefined();
        const uuid = String(savedCall![0]).replace("Saved: ", "").trim();
        spy.mockRestore();

        // Verify finding appears in listing with full title
        const listings = await helpers.listFindings();
        expect(listings).toContain("SQL Injection in Login Form");

        // Clean up
        await helpers.deleteFinding(uuid);
    }, 30_000);

    // -- Test 2c: scan results with offset/limit --

    test("2c: scan results with offset/limit", async () => {
        // Launch a scan to get an ID
        const launchText = await helpers.launchScan("nmap", "127.0.0.1", 30);
        const scanId = launchText.match(/ID: ([a-f0-9-]+)/)?.[1];
        expect(scanId).toBeDefined();

        // Wait briefly for the scan to start
        await new Promise(r => setTimeout(r, 3000));

        // Simulate: scan results <id> offset=0 limit=5
        const spy1 = spyOn(console, "log");
        await handleScanCommand(helpers, ["scan", "results", scanId!, "offset=0", "limit=5"], c);
        spy1.mockRestore();
        // No crash = success for valid offset/limit

        // NaN path: scan results <id> offset=abc
        const spy2 = spyOn(console, "log");
        await handleScanCommand(helpers, ["scan", "results", scanId!, "offset=abc"], c);
        const errorCall = spy2.mock.calls.find(call => String(call[0]).includes("offset and limit must be numbers"));
        expect(errorCall).toBeDefined();
        spy2.mockRestore();
    }, 30_000);

    // -- Test 2d: report with title --

    test("2d: report with title", async () => {
        const line = 'report title="Q1 Security Assessment"';
        const parts = tokenize(line);

        // Same title extraction logic as index.ts:355
        const title = parts.slice(1).find(s => s.startsWith("title="))?.split("=").slice(1).join("=");
        expect(title).toBe("Q1 Security Assessment");

        const report = await helpers.generateReport(title);
        expect(report).toContain("Report saved to:");
    }, 30_000);

    // -- Test 2e: error recovery - client usable after error --

    test("2e: error recovery - client usable after error", async () => {
        // Call nonexistent tool (should throw)
        let threw = false;
        try {
            await client.callTool("nonexistent_tool_xyz", {});
        } catch {
            threw = true;
        }
        expect(threw).toBe(true);

        // Client must still be usable after the error
        const result = await client.callTool("ping_target", { target: "127.0.0.1", count: 1 });
        expect(result.isError).toBe(false);
        expect(result.content[0]!.text).toContain("127.0.0.1");
    }, 30_000);

    // -- Test 2f: finding save NaN cvss validation --

    test("2f: finding save NaN cvss validation", async () => {
        const parts = [
            "finding", "save",
            "title=NaN CVSS Test", "severity=low", "description=Testing NaN",
            "target=127.0.0.1", "tool=manual", "cvss=abc",
        ];

        const spy = spyOn(console, "log");
        await handleFindingCommand(helpers, parts, c);

        const errorCall = spy.mock.calls.find(call => String(call[0]).includes("cvss must be a number"));
        expect(errorCall).toBeDefined();
        spy.mockRestore();

        // Verify no finding was created
        const listings = await helpers.listFindings();
        expect(listings).not.toContain("NaN CVSS Test");
    }, 30_000);

    // -- Test 2g: scan launch NaN timeout_secs validation --

    test("2g: scan launch NaN timeout_secs validation", async () => {
        const parts = ["scan", "launch", "nmap", "127.0.0.1", "timeout_secs=foo"];

        const spy = spyOn(console, "log");
        await handleScanCommand(helpers, parts, c);

        const errorCall = spy.mock.calls.find(call => String(call[0]).includes("timeout_secs must be a number"));
        expect(errorCall).toBeDefined();
        spy.mockRestore();
    }, 30_000);

    afterAll(async () => {
        await client.disconnect();
    });
});
