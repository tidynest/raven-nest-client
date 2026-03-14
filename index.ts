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

// ANSI colour codes - warm palette for terminal output
const c = {
    name:   "\x1b[33m",     // amber    - tool names
    dim:    "\x1b[2m",      // dim      - descriptions
    label:  "\x1b[36m",     // cyan     - labels
    err:    "\x1b[31m",     // red      - errors
    ok:     "\x1b[32m",     // green    - success
    prompt: "\x1b[35m",     // magenta  - REPL prompt
    reset:  "\x1b[0m",      // reset all styles
} as const;

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
        console.log(`  ${c.name}${tool.name}${c.reset}`);
        console.log(`    ${c.dim}${tool.description.slice(0, 80)}${c.reset}`);
        console.log(`    ${c.label}required:${c.reset} ${params}\n`);
    }
}

function printToolDetail(tool: ToolDefinition): void {
    console.log(`\n  ${c.name}${tool.name}${c.reset}`);
    console.log(`  ${c.dim}${tool.description}${c.reset}\n`);

    const props = tool.inputSchema.properties ?? {};
    const required = new Set(tool.inputSchema.required ?? []);

    if (Object.keys(props).length === 0) {
        console.log(`  ${c.dim}No parameters${c.reset}\n`);
        return;
    }

    console.log(`  ${c.label}Parameters:${c.reset}`);
    for (const [name, schema] of Object.entries(props)) {
        const s = schema as Record<string, unknown>;
        const tag = required.has(name) ? `${c.err}required${c.reset}` : `${c.dim}optional${c.reset}`;
        const type = s.type ?? "any";
        console.log(`    ${c.name}${name}${c.reset} (${type}) [${tag}]`);
        if (s.description) {
            console.log(`      ${c.dim}${s.description}${c.reset}`);
        }
    }
    console.log();
}

async function main() {
    const command   = process.argv[2];

    if (!command) {
        await repl();
        return;
    }

    const client    = new McpClient(SERVER_BIN);
    const toolName  = process.argv[3];

    if (command !== "list" && command !== "call" && command !== "describe") {
        console.log(`${c.label}Usage:${c.reset} bun run index.ts <list | call <tool> [key=value ...] | describe <tool>>`);
        return;
    }

    if ((command === "call" || command === "describe") && !toolName) {
        console.log(`${c.err}Error:${c.reset} missing tool name`);
        console.log(`${c.label}Usage:${c.reset} bun run index.ts ${command} <tool>`);
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

            case "describe":
                const { tools: allTools } = await client.listTools();
                const match = allTools.find(t => t.name === toolName);
                if (!match) {
                    console.log(`${c.err}Unknown tool:${c.reset} ${toolName}`);
                } else {
                    printToolDetail(match);
                }
                break;
        }
    } catch (err) {
        console.error(`${c.err}Error:${c.reset}`, (err as Error).message);
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
            const line = await ask(rl, `${c.prompt}raven>${c.reset} `);
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
                            console.log(`${c.label}Usage:${c.reset} call <tool> [key=value ...]`);
                            break;
                        }
                        const args = parseArgs(parts.slice(2));

                        const result = await client.callTool(toolName!, args);

                        for (const block of result.content) {
                            console.log(block.text);
                        }
                        break;

                    case "describe":
                        if (!toolName) {
                            console.log(`${c.label}Usage:${c.reset} describe <tool>`);
                            break;
                        }
                        const {tools: allTools} = await client.listTools();
                        const found = allTools.find(t => t.name === toolName);
                        if (!found) {
                            console.log(`${c.err}Unknown tool:${c.reset} ${toolName}`);
                        } else {
                            printToolDetail(found);
                        }
                        break;
                        
                    case "help":
                        console.log(`${c.label}Commands:${c.reset} list, call <tool> [key=value ...], describe <tool>, help, quit`);
                        break;

                    default:
                        console.log(`${c.err}Unknown command:${c.reset} ${cmd}`);
                        break;
                }
            } catch (err) {
                console.error(`${c.err}Error:${c.reset}`, (err as Error).message);
            }
        }
    } catch (err) {
        console.error(`${c.err}Error:${c.reset}`, (err as Error).message);
    } finally {
        rl.close();
        await client.disconnect();
    }
}

async function connect(client: McpClient): Promise<void> {
    console.log(`${c.dim}Connecting to raven-nest-mcp...${c.reset}`);
    const info = await client.connect();
    console.log(`${c.ok}Connected:${c.reset} ${info.serverInfo.name} v${info.serverInfo.version}`);
    console.log(`${c.dim}Protocol: ${info.protocolVersion}${c.reset}\n`);
}

main().catch(console.error);
