// index.ts
// CLI entry point - connects to the Rust MCP server and dispatches
// subcommands: list tools or call any tool by name.
// Run: bun run index.ts [list | call <tool> [key=value ...]]
// No args starts interactive REPL mode.

import { createInterface } from "readline";
import { McpClient } from "./src/client";
import type { ToolDefinition} from "./src/types";

// Server binary path — override with RAVEN_SERVER env var
const SERVER_BIN = process.env.RAVEN_SERVER
    ?? `${process.env.HOME}/RustroverProjects/raven-nest-mcp/target/release/raven-server`;

/** Parse "key=value" pairs into an object. Handles values containing "="
 * (like base64 strings) by splitting only on the first "=". Pairs without
 * "=" are silently dropped - same intent as Rust's splitn(2, '='). */
function parseArgs(pairs: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const pair of pairs) {
        const eq = pair.indexOf("=");
        if (eq === -1) continue;
        result[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    return result;
}

function printToolList(tools: ToolDefinition[]): void {
    console.log(`${tools.length} tools available:\n`);
    for (const tool of tools) {
        const params = tool.inputSchema.required?.join(", ") ?? "none";
        console.log(`  ${tool.name}`);
        console.log(`    ${tool.description.slice(0, 80)}`);
        console.log(`    required: ${params}\n`);
    }
}

async function main() {
    const command   = process.argv[2];

    if (!command) {
        await repl();
        return;
    }

    const client    = new McpClient(SERVER_BIN);
    const toolName  = process.argv[3];

    if (command !== "list" && command !== "call") {
        console.log("Usage: bun run index.ts <list | call <tool> [key=value ...]>");
        return;
    }

    if (command === "call" && !toolName) {
        console.log("Error: missing tool name");
        console.log("Usage: bun run index.ts call <tool> [key=value ...]");
        return;
    }

    try {
        await connect(client);

        switch (command) {
            case "list":
                const { tools } = await client.listTools();
                printToolList(tools);
                break;

            case "call":
                const args = parseArgs(process.argv.slice(4));

                const result = await client.callTool(toolName!, args);

                for (const block of result.content) {
                    console.log(block.text);
                }
                break;
        }
    } catch (err) {
        console.error("Error:", (err as Error).message);
    } finally {
        await client.disconnect();
    }
}

function ask(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
    return new Promise(resolve => rl.question(prompt, resolve));
}

async function repl() {
    const client = new McpClient(SERVER_BIN);
    const rl = createInterface({
        input:       process.stdin,
        output:      process.stdout,
        history:     [],
        historySize: 100,
    });

    try {
        await connect(client);

        while (true) {
            const line = await ask(rl, "raven> ");
            if (line === "quit") break;
            if (!line.trim()) continue;

            const parts    = line.split(" ");
            const cmd      = parts[0];
            const toolName = parts[1];

            try {
                switch (cmd) {
                    case "list":
                        const {tools} = await client.listTools();
                        printToolList(tools);
                        break;
                    case "call":
                        if (!toolName) {
                            console.log("Usage: call <tool> [key=value ...]");
                            break;
                        }
                        const args = parseArgs(parts.slice(2));

                        const result = await client.callTool(toolName!, args);

                        for (const block of result.content) {
                            console.log(block.text);
                        }
                        break;
                    case "help":
                        console.log("Commands: list, call <tool> [key=value ...], help, quit");
                        break;
                    default:
                        console.log(`Unknown command: ${cmd}`);
                        break;
                }
            } catch (err) {
                console.error("Error:", (err as Error).message);
            }
        }
    } catch (err) {
        console.error("Error:", (err as Error).message);
    } finally {
        rl.close();
        await client.disconnect();
    }
}

async function connect(client: McpClient): Promise<void> {
    console.log("Connecting to raven-nest-mcp...");
    const info = await client.connect();
    console.log(`Connected: ${info.serverInfo.name} v${info.serverInfo.version}`);
    console.log(`Protocol: ${info.protocolVersion}\n`);
}

main().catch(console.error);
