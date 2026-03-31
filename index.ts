// index.ts
// CLI entry point - connects to the Rust MCP server and dispatches
// subcommands or starts an interactive REPL with tab completion.
// Run: bun run index.ts [list | call <tool> [key=value ...] | describe <tool>]
// Flags: --version, --help, --no-color

import { createInterface } from "readline";
import { McpClient } from "./src/client";
import { RavenHelpers } from "./src/client/helpers";
import { handleScanCommand } from "./src/commands/scan";
import { handleFindingCommand, parseArgs } from "./src/commands/finding";
import type { ToolDefinition } from "./src/types";
import { SERVER_BIN } from "./src/config";
import pkg from "./package.json";

// Disable ANSI when --no-color flag is passed or NO_COLOR env is set
const noColor = process.argv.includes("--no-color") || !!process.env.NO_COLOR;
const ansi = (code: string) => noColor ? "" : code;

// ANSI colour codes - warm palette for terminal output
const c = {
    name:   ansi("\x1b[33m"),     // amber   - tool names
    dim:    ansi("\x1b[2m"),      // dim     - descriptions and metadata
    label:  ansi("\x1b[36m"),     // cyan    - labels and headings
    err:    ansi("\x1b[31m"),     // red     - errors
    ok:     ansi("\x1b[32m"),     // green   - success messages
    prompt: ansi("\x1b[35m"),     // magenta - REPL prompt
    reset:  ansi("\x1b[0m"),      // reset all styles
} as const;

/** Tokenize a REPL input line respecting quoted strings.
 *  Handles double and single quotes so multi-word values survive intact.
 *  e.g. title="SQL Injection" becomes the single token title=SQL Injection */
function tokenize(line: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let quote = "";

    for (const ch of line) {
        if (quote) {
            if (ch === quote) {
                quote = "";
            } else {
                current += ch;
            }
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === " ") {
            if (current) {
                tokens.push(current);
                current = "";
            }
        } else {
            current += ch;
        }
    }
    if (current) tokens.push(current);
    return tokens;
}

/** Coerce string values to their schema-declared types before sending to the
 *  server. parseArgs() returns all strings, but JSON-RPC needs proper types.
 *  Looks up each key in the tool's inputSchema and converts "integer"/"number"
 *  to Number and "boolean" to true/false. Unknown keys pass through as strings. */
function coerceArgs(raw: Record<string, string>, tool: ToolDefinition): Record<string, unknown> {
    const props = tool.inputSchema.properties ?? {};
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(raw)) {
        const schema = props[key] as Record<string, unknown> | undefined;
        if (!schema) {
            result[key] = value;
            continue;
        }

        // Schema type can be a string ("integer"), array (["integer","null"]),
        // or comma-joined string from display ("integer,null")
        const typeVal = schema.type;
        const types: string[] = Array.isArray(typeVal)
            ? typeVal
            : String(typeVal ?? "string").split(",").map(t => t.trim());

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

/** Print a compact summary of all available tools: name, truncated
 *  description, and required parameters. */
function printToolList(tools: ToolDefinition[]): void {
    console.log(`${tools.length} tools available:\n`);
    for (const tool of tools) {
        const params = tool.inputSchema.required?.join(", ") ?? "none";
        console.log(`  ${c.name}${tool.name}${c.reset}`);
        console.log(`    ${c.dim}${tool.description.slice(0, 80)}${c.reset}`);
        console.log(`    ${c.label}required:${c.reset} ${params}\n`);
    }
}

/** Print detailed information about a single tool, including all
 *  parameters with their types, requirement status, and descriptions. */
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

/** Main entry point. Handles CLI flags (--version, --help), dispatches
 *  subcommands (list, call, describe), or falls through to the REPL. */
async function main() {
    // Filter out flags so positional args are clean
    const args = process.argv.filter(a => !a.startsWith("--"));
    const command = args[2];

    // Handle CLI flags before connecting to the server
    if (process.argv.includes("--version")) {
        console.log(`raven-nest-client v${pkg.version}`);
        return;
    }
    if (process.argv.includes("--help")) {
        console.log(`${c.label}raven-nest-client${c.reset} v${pkg.version}`);
        console.log(`\n${c.label}Usage:${c.reset} bun run index.ts [command] [options]\n`);
        console.log(`${c.label}Commands:${c.reset}`);
        console.log(`  list                             List all server tools`);
        console.log(`  call <tool> [key=value ...]       Invoke a tool`);
        console.log(`  describe <tool>                  Show tool details\n`);
        console.log(`${c.label}Flags:${c.reset}`);
        console.log(`  --version                        Print version and exit`);
        console.log(`  --help                           Print this help and exit`);
        console.log(`  --no-color                       Disable ANSI colour output\n`);
        console.log(`No arguments starts the interactive REPL.`);
        return;
    }

    // No command given - drop into interactive mode
    if (!command) {
        await repl();
        return;
    }

    // Set up a client with progress callback for long-running tools
    const client = new McpClient(SERVER_BIN, (msg) => {
        console.error(`${c.dim}[progress] ${msg}${c.reset}`);
    });
    const toolName = args[3];

    // Validate command before attempting connection
    if (command !== "list" && command !== "call" && command !== "describe") {
        console.log(`${c.label}Usage:${c.reset} bun run index.ts <list | call <tool> [key=value ...] | describe <tool>>`);
        return;
    }

    // "call" and "describe" both require a tool name argument
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
                // Coerce string args to schema types (number, boolean, etc.)
                const rawArgs   = parseArgs(process.argv.slice(4));
                const { tools: callDefs } = await client.listTools();
                const callDef   = callDefs.find(t => t.name === toolName);
                const args      = callDef ? coerceArgs(rawArgs, callDef) : rawArgs;
                const t0        = performance.now();
                const result    = await client.callTool(toolName!, args);
                const elapsed   = ((performance.now() - t0) / 1000).toFixed(1);

                // Print each content block from the tool response
                for (const block of result.content) {
                    console.log(block.text);
                }
                console.log(`${c.dim}(completed in ${elapsed}s)${c.reset}`);
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
        // Always disconnect to kill the server process cleanly
        await client.disconnect();
    }
}

/** Wraps readline.question in a Promise for async/await usage. */
function ask(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
    return new Promise(resolve => rl.question(prompt, resolve));
}

/** Interactive REPL with tab completion for commands and tool names.
 *  Supports all CLI commands plus scan/finding management shortcuts. */
async function repl() {
    // Set up client with progress callback
    const client = new McpClient(SERVER_BIN, (msg) => {
        console.error(`${c.dim}[progress] ${msg}${c.reset}`);
    });
    const helpers = new RavenHelpers(client);

    // Declared outside try so finally can close it even on setup exceptions
    let rl: ReturnType<typeof createInterface> | null = null;

    try {
        await connect(client);

        // Fetch tools early so tab completion has tool names available
        const { tools } = await client.listTools();
        const commands = ["list", "call", "describe", "scan", "scans", "finding", "findings", "report", "help", "quit"];

        // Set up readline with tab completion and persistent history
        rl = createInterface({
            input:       process.stdin,
            output:      process.stdout,
            history:     [],
            historySize: 100,
            completer(line: string): [string[], string] {
                const parts = line.split(" ");

                // Complete tool names after "call" or "describe"
                if (parts.length === 2 && (parts[0] === "call" || parts[0] === "describe")) {
                    const prefix = parts[1]!;
                    const matches = tools
                        .map(t => t.name)
                        .filter(n => n.startsWith(prefix))
                        .map(n => `${parts[0]} ${n}`);
                    return [matches, line];
                }

                // Complete command names at the start of the line
                if (parts.length === 1) {
                    const matches = commands.filter(cmd => cmd.startsWith(line));
                    return [matches, line];
                }

                return [[], line];
            },
        });

        // Main REPL loop - reads a line, dispatches, repeats
        while (true) {
            const line = await ask(rl, `${c.prompt}raven>${c.reset} `);
            if (line === "quit") break;
            if (!line.trim()) continue;

            // Quote-aware split so multi-word values survive intact
            const parts    = tokenize(line);
            const cmd      = parts[0];
            const toolName = parts[1];

            try {
                switch (cmd) {
                    case "list":
                        const {tools: listResult} = await client.listTools();
                        printToolList(listResult);
                        break;

                    case "call":
                        if (!toolName) {
                            console.log(`${c.label}Usage:${c.reset} call <tool> [key=value ...]`);
                            break;
                        }
                        // Coerce string args to schema types (cached, no round-trip)
                        const rawCallArgs = parseArgs(parts.slice(2));
                        const {tools: replDefs} = await client.listTools();
                        const replDef   = replDefs.find(t => t.name === toolName);
                        const args      = replDef ? coerceArgs(rawCallArgs, replDef) : rawCallArgs;
                        const t0        = performance.now();
                        const result    = await client.callTool(toolName!, args);
                        const elapsed   = ((performance.now() -t0) / 1000).toFixed(1);

                        for (const block of result.content) {
                            console.log(block.text);
                        }
                        console.log(`${c.dim}(completed in ${elapsed}s)${c.reset}`);
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

                    // Scan management shortcuts
                    case "scan":
                        await handleScanCommand(helpers, parts, c);
                        break;

                    case "scans":
                        console.log(await helpers.listScans());
                        break;

                    // Finding management shortcuts
                    case "finding":
                        await handleFindingCommand(helpers, parts, c);
                        break;

                    case "findings":
                        console.log(await helpers.listFindings());
                        break;

                    // Report generation - optional title via title=... argument
                    case "report": {
                        const title = parts.slice(1).find(s => s.startsWith("title="))?.split("=").slice(1).join("=");
                        console.log(await helpers.generateReport(title));
                        break;
                    }

                    case "help":
                        console.log(`\n${c.label}Tools${c.reset}`);
                        console.log(`  list                             List all server tools`);
                        console.log(`  describe <tool>                  Show tool details and parameters`);
                        console.log(`  call <tool> [key=value ...]      Invoke a tool\n`);
                        console.log(`${c.label}Scans${c.reset}`);
                        console.log(`  scan launch <tool> <target>      Start a background scan`);
                        console.log(`  scan status <id>                 Check scan progress`);
                        console.log(`  scan results <id>                Retrieve scan output`);
                        console.log(`  scan cancel <id>                 Cancel a running scan`);
                        console.log(`  scans                            List all scans\n`);
                        console.log(`${c.label}Findings${c.reset}`);
                        console.log(`  finding save <key=value ...>     Save a vulnerability finding`);
                        console.log(`  finding get <id>                 Retrieve a finding`);
                        console.log(`  finding delete <id>              Delete a finding`);
                        console.log(`  findings                         List all findings`);
                        console.log(`  report [title=...]               Generate a report\n`);
                        console.log(`${c.label}Session${c.reset}`);
                        console.log(`  help                             Show this help`);
                        console.log(`  quit                             Exit the REPL\n`);
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
        // Close readline in finally so exceptions between creation and the
        // while loop can't leave stdin open and hang the process
        rl?.close();
        await client.disconnect();
    }
}

/** Connect to the MCP server and print connection info.
 *  Used by both one-shot commands and the interactive REPL. */
async function connect(client: McpClient): Promise<void> {
    console.log(`${c.dim}Connecting to raven-nest-mcp...${c.reset}`);
    const info = await client.connect();
    console.log(`${c.ok}Connected:${c.reset} ${info.serverInfo.name} v${info.serverInfo.version}`);
    console.log(`${c.dim}Protocol: ${info.protocolVersion}${c.reset}\n`);
    console.log(`${c.dim}Type "help" for commands, "quit" to exit.${c.reset}\n`);
}

main().catch(console.error);
