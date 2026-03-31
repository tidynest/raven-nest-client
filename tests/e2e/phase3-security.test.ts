// Phase 3: Real security tool execution against Docker targets
// All web scanners target Docker containers, never the host network.
// SAFETY: Only 127.0.0.1:3000 (Juice Shop) and 127.0.0.1:80 (bWAPP).

import { describe, test, expect, afterAll } from "bun:test";
import { McpClient } from "../../src/client/mcp-client";
import { RavenHelpers } from "../../src/client/helpers";
import { SERVER_BIN } from "../../src/config";

describe("Phase 3: Security Tool Execution", () => {
    const client = new McpClient(SERVER_BIN, (msg) => {
        process.stderr.write(`[progress] ${msg}\n`);
    });
    const helpers = new RavenHelpers(client);

    test("connects to server", async () => {
        await client.connect();
    });

    // -- Test 3a: nmap port scan --

    test("3a: run_nmap port scan against localhost", async () => {
        const result = await client.callTool("run_nmap", { target: "127.0.0.1" });
        expect(result.isError).toBe(false);
        const text = result.content[0]!.text;
        // Should show open ports for our containers
        expect(text.length).toBeGreaterThan(0);
        console.log(`[3a] nmap found: ${text.slice(0, 200)}`);
    }, 60_000);

    // -- Test 3b: whatweb against Juice Shop --

    test("3b: run_whatweb against Juice Shop", async () => {
        const result = await client.callTool("run_whatweb", { target: "http://127.0.0.1:3000" });
        expect(result.isError).toBe(false);
        const text = result.content[0]!.text;
        expect(text.length).toBeGreaterThan(0);
        console.log(`[3b] whatweb Juice Shop: ${text.slice(0, 200)}`);
    }, 60_000);

    // -- Test 3c: nikto against Juice Shop --

    test("3c: run_nikto against Juice Shop", async () => {
        const result = await client.callTool("run_nikto", { target: "http://127.0.0.1:3000" });
        expect(result.isError).toBe(false);
        const text = result.content[0]!.text;
        expect(text.length).toBeGreaterThan(0);
        console.log(`[3c] nikto findings (truncated): ${text.slice(0, 300)}`);
    }, 300_000);  // nikto can take several minutes

    // -- Test 3d: whatweb against bWAPP --

    test("3d: run_whatweb against bWAPP", async () => {
        const result = await client.callTool("run_whatweb", { target: "http://127.0.0.1:80" });
        expect(result.isError).toBe(false);
        const text = result.content[0]!.text;
        expect(text.length).toBeGreaterThan(0);
        console.log(`[3d] whatweb bWAPP: ${text.slice(0, 200)}`);
    }, 60_000);

    // -- Test 3e: nuclei against Juice Shop --

    test("3e: run_nuclei against Juice Shop", async () => {
        const result = await client.callTool("run_nuclei", { target: "http://127.0.0.1:3000" });
        expect(result.isError).toBe(false);
        const text = result.content[0]!.text;
        expect(text.length).toBeGreaterThan(0);
        console.log(`[3e] nuclei findings (truncated): ${text.slice(0, 300)}`);
    }, 300_000);  // nuclei can take several minutes

    // -- Test 3f: background scan lifecycle --

    test("3f: background scan lifecycle with nmap", async () => {
        const launchText = await helpers.launchScan("nmap", "127.0.0.1", 30);
        expect(launchText).toContain("Scan launched");

        const scanId = launchText.match(/ID: ([a-f0-9-]+)/)?.[1];
        expect(scanId).toBeDefined();

        // Poll until completed or failed (max 60s)
        let status = "";
        for (let i = 0; i < 30; i++) {
            status = await helpers.getScanStatus(scanId!);
            if (status.includes("Completed") || status.includes("Failed")) break;
            await new Promise(r => setTimeout(r, 2000));
        }
        expect(status).toMatch(/Completed|Failed/);

        // Full results
        const results = await helpers.getScanResults(scanId!);
        expect(results.length).toBeGreaterThan(0);
        console.log(`[3f] scan results (truncated): ${results.slice(0, 200)}`);

        // Paginated results
        const paged = await helpers.getScanResults(scanId!, 0, 5);
        expect(paged.length).toBeGreaterThan(0);
    }, 120_000);

    // -- Test 3g: http_request against Juice Shop --

    test("3g: http_request against Juice Shop", async () => {
        const result = await client.callTool("http_request", { url: "http://127.0.0.1:3000" });
        expect(result.isError).toBe(false);
        const text = result.content[0]!.text;
        expect(text.length).toBeGreaterThan(0);
        console.log(`[3g] http_request (truncated): ${text.slice(0, 200)}`);
    }, 30_000);

    afterAll(async () => {
        await client.disconnect();
    });
});
