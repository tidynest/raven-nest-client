// src/client/progress.test.ts
// Progress contract, run against a scripted stdio server so it needs neither
// the Rust binary nor Docker. The server reports progress only for a call that
// carried a progressToken, so this fails if the client stops sending one or
// stops listening for notifications/progress.

import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { McpClient } from "./mcp-client";

const FIXTURE = resolve(import.meta.dir, "..", "..", "tests", "fixtures", "progress-server.ts");

describe("progress notifications", () => {
    test("a tool call asks for progress and the callback receives the message", async () => {
        const messages: string[] = [];
        const client = new McpClient(FIXTURE, (message) => messages.push(message));

        try {
            await client.connect();
            await client.callTool("run_nmap", { target: "127.0.0.1" });
            expect(messages).toEqual(["fixture scanning... (15s elapsed)"]);
        } finally {
            await client.disconnect();
        }
    });
});
