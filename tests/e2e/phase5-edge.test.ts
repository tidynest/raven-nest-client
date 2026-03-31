// Phase 5: Edge cases
// Tests unwrapText isError path and CLI piping cleanliness.

import { describe, test, expect, afterAll } from "bun:test";
import { resolve } from "path";
import { McpClient } from "../../src/client/mcp-client";
import { RavenHelpers } from "../../src/client/helpers";
import { SERVER_BIN } from "../../src/config";

const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");

describe("Phase 5: Edge Cases", () => {
    const client = new McpClient(SERVER_BIN);
    const helpers = new RavenHelpers(client);

    test("connects to server", async () => {
        await client.connect();
    });

    // -- Test 5a: getFinding with zero UUID --

    test("5a: getFinding with zero UUID - document isError behaviour", async () => {
        let behaviour: string;
        try {
            const text = await helpers.getFinding("00000000-0000-0000-0000-000000000000");
            // If we get here, isError was false - server returned normal response
            behaviour = `normal response: ${text.slice(0, 120)}`;
            expect(text.length).toBeGreaterThan(0);
        } catch (err) {
            // If we get here, isError was true - unwrapText threw
            behaviour = `error thrown: ${(err as Error).message}`;
            expect((err as Error).message.length).toBeGreaterThan(0);
        }
        console.log(`[5a] Server behaviour for invalid UUID: ${behaviour}`);
    }, 15_000);

    // -- Test 5b: CLI piping cleanliness --

    test("5b: CLI piping cleanliness - connection messages location", async () => {
        const proc = Bun.spawn(
            ["bun", "run", "index.ts", "call", "ping_target", "target=127.0.0.1", "count=1"],
            {
                cwd: PROJECT_ROOT,
                stdout: "pipe",
                stderr: "pipe",
            },
        );

        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        await proc.exited;

        // Document where connection messages land
        const connectInStdout = stdout.includes("Connecting") || stdout.includes("Connected:");
        const connectInStderr = stderr.includes("Connecting") || stderr.includes("Connected:");

        console.log(`[5b] Connection messages in stdout: ${connectInStdout}`);
        console.log(`[5b] Connection messages in stderr: ${connectInStderr}`);
        if (connectInStdout) {
            console.log("[5b] Known limitation: connect() uses console.log, not console.error");
        }

        // Tool output should be in stdout regardless
        expect(stdout).toContain("127.0.0.1");
    }, 30_000);

    afterAll(async () => {
        await client.disconnect();
    });
});
