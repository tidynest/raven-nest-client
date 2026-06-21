// src/commands/engagement.test.ts
// Integration test - spawns the real server and exercises the engagement
// helpers: switch the active engagement, then read it back. activeEngagement()
// reads structuredContent.active (not parsed text), so this also covers the
// structured-first path end-to-end.

import { describe, test, expect, afterAll } from "bun:test";
import { McpClient } from "../client/mcp-client";
import { RavenHelpers } from "../client/helpers";
import { SERVER_BIN } from "../config";

describe("Engagement helpers", () => {
    const client  = new McpClient(SERVER_BIN);
    const helpers = new RavenHelpers(client);
    const name    = "test-eng";

    test("connects", async () => {
        await client.connect();
    });

    test("sets the active engagement", async () => {
        // Server reply is "Switched to engagement '<name>' (...)".
        const text = await helpers.setEngagement(name);
        expect(text).toContain(name);
    });

    test("reports it as the active engagement", async () => {
        // Reads structuredContent.active rather than parsing the listing text.
        expect(await helpers.activeEngagement()).toBe(name);
    });

    test("lists engagements including it", async () => {
        expect(await helpers.listEngagements()).toContain(name);
    });

    afterAll(async () => {
        await client.disconnect();
    });
});
