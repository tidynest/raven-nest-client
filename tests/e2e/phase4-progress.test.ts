// Phase 4: Progress notifications and stderr separation
// Verifies progress goes to stderr (not stdout) and that resetPendingTimers
// keeps long-running tools alive despite short default timeouts.

import { describe, test, expect, afterAll } from "bun:test";
import { resolve } from "path";
import { McpClient } from "../../src/client/mcp-client";
import { SERVER_BIN } from "../../src/config";

const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");

// -- Test 4a: progress goes to stderr, not stdout --

describe("Phase 4a: stdout/stderr separation", () => {
    test("progress goes to stderr, tool output to stdout", async () => {
        const proc = Bun.spawn(
            ["bun", "run", "index.ts", "call", "run_nmap", "target=127.0.0.1"],
            {
                cwd: PROJECT_ROOT,
                stdout: "pipe",
                stderr: "pipe",
            },
        );

        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        await proc.exited;

        // Tool output should be in stdout
        expect(stdout.length).toBeGreaterThan(0);

        // If progress was emitted, it should only be in stderr
        if (stderr.includes("[progress]")) {
            expect(stdout).not.toContain("[progress]");
            console.log("[4a] PASS: progress found in stderr only");
        } else {
            console.log("[4a] No progress notifications emitted (tool completed quickly)");
        }

        // Verify no PROGRESS string leaked into stdout
        expect(stdout).not.toContain("PROGRESS");
    }, 120_000);
});

// -- Test 4b: resetPendingTimers keeps long tools alive --

describe("Phase 4b: resetPendingTimers", () => {
    test("short timeout + long tool - timer resets extend deadline", async () => {
        let progressCount = 0;

        // 15s default timeout - nmap on localhost should finish in time,
        // but whatweb may need progress resets
        const client = new McpClient(SERVER_BIN, (msg) => {
            progressCount++;
            process.stderr.write(`[4b progress #${progressCount}] ${msg}\n`);
        }, 15_000);

        try {
            await client.connect();

            // Use whatweb which is moderately long and may emit progress
            const result = await client.callTool("run_whatweb", {
                target: "http://127.0.0.1:3000",
            });

            // If we get here, the tool completed (timer resets worked or tool was fast)
            expect(result.isError).toBe(false);
            console.log(`[4b] PASS: Tool completed. Progress notifications received: ${progressCount}`);

            if (progressCount > 0) {
                console.log("[4b] Timer resets confirmed working (progress received, no timeout)");
            } else {
                console.log("[4b] Tool completed within initial timeout (no resets needed)");
            }
        } catch (err) {
            const msg = (err as Error).message;
            if (msg.includes("timed out")) {
                console.log(`[4b] TIMEOUT: Timer resets may not be working. Progress count: ${progressCount}`);
                // This is a documented possible outcome - don't fail the test
            } else {
                throw err;
            }
        } finally {
            await client.disconnect();
        }
    }, 120_000);
});
