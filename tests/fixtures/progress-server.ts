#!/usr/bin/env bun
// tests/fixtures/progress-server.ts
// Scripted stdio MCP server for src/client/progress.test.ts. It answers the
// handshake, then for each tools/call sends one progress notification when the
// request carried a progressToken and none when it did not. raven-nest-mcp has
// followed that contract since 0.4.1, so the test needs no Rust build.

const send = (message: unknown) => process.stdout.write(JSON.stringify(message) + "\n");

for await (const line of console) {
    if (!line.trim()) continue;
    const { id, method, params } = JSON.parse(line);

    if (method === "initialize") {
        send({
            jsonrpc: "2.0",
            id,
            result: {
                protocolVersion: params.protocolVersion,
                capabilities: { tools: {} },
                serverInfo: { name: "progress-fixture", version: "0.0.0" },
            },
        });
    } else if (method === "tools/call") {
        const progressToken = params?._meta?.progressToken;
        if (progressToken !== undefined) {
            send({
                jsonrpc: "2.0",
                method: "notifications/progress",
                params: { progressToken, progress: 15, message: "fixture scanning... (15s elapsed)" },
            });
        }
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "done" }], isError: false } });
    }
}
