// src/client/mcp-client.ts
// High-level MCP client - wraps StdioTransport into a clean API.
// Handles the two-step handshake (initialize -> notifications/initialized)
// and exposes typed methods for tool discovery and invocation.

import { StdioTransport } from "./transport";
import { isJsonRpcError } from "../types";
import type {
    JsonRpcResponse,
    InitialiseResult,
    ToolDefinition,
    ToolListResult,
    ToolCallResult,
} from "../types";

export class McpClient {
    // Cache for the tool list - populated on first listTools() call,
    // cleared on disconnect() or refreshTools()
    private cachedTools:    ToolDefinition[] | null = null;

    // The underlying stdio transport that manages the server process
    private transport:      StdioTransport;

    // Optional callback invoked when the server sends progress notifications
    private onProgress?:    (message: string) => void;

    /** Creates a new MCP client targeting the given server binary.
     *  Optionally accepts a progress callback for long-running tool updates.
     *  Optional timeout (ms) overrides the default 120s per-request deadline. */
    constructor(binPath: string, onProgress?: (message: string) => void, timeout?: number) {
        this.transport      = new StdioTransport(binPath, timeout);
        this.onProgress     = onProgress;
    }

    /** Start the server process and complete the MCP handshake.
     *
     *  The MCP handshake is two steps:
     *  1. Client sends "initialize" with its capabilities and protocol version
     *  2. Client sends "notifications/initialized" to signal readiness
     *  Only after step 2 can the client call tools. */
    async connect(): Promise<InitialiseResult> {
        await this.transport.start();

        // Wire up progress notifications from the server so callers
        // can display scan progress, tool output, etc. in real time.
        // Also resets pending request timers so long-running tools
        // don't timeout while actively reporting progress.
        this.transport.onNotification((method, params) => {
            if (method === "notifications/message" && params?.data) {
                this.transport.resetPendingTimers();
                this.onProgress?.(String(params.data));
            }
        });

        // Step 1: negotiate protocol version and exchange capabilities
        const response = await this.transport.request("initialize", {
            protocolVersion:    "2025-03-26",
            capabilities:       {},
            clientInfo: { name: "raven-nest-client", version: "0.2.0" },
        });

        const result = this.unwrap<InitialiseResult>(response);

        // Step 2: tell the server we're ready (notification = no response expected)
        await this.transport.notify("notifications/initialized");

        return result;
    }

    /** Fetch every tool the server exposes, with names, descriptions, and schemas.
     *  Results are cached after the first call - use refreshTools() to force re-fetch. */
    async listTools(): Promise<ToolListResult> {
        // Return cached tools if available to avoid redundant round-trips
        if (this.cachedTools) return { tools: this.cachedTools };

        const response      = await this.transport.request("tools/list");
        const result        = this.unwrap<ToolListResult>(response);
        this.cachedTools    = result.tools;
        return result;
    }

    /** Clear the tool cache and re-fetch the list from the server.
     *  Useful if the server's tool set may have changed at runtime. */
    async refreshTools(): Promise<ToolListResult> {
        this.cachedTools = null;
        return this.listTools();
    }

    /** Invoke a server tool by name.
     *  `args` maps directly to the tool's inputSchema properties. */
    async callTool(name: string, args?: Record<string, unknown>): Promise<ToolCallResult> {
        const response = await this.transport.request("tools/call", {
            name,
            arguments: args ?? {},
        });
        return this.unwrap<ToolCallResult>(response);
    }

    /** Shut down the transport and kill the server process.
     *  Also clears the tool cache since the server is no longer running. */
    async disconnect(): Promise<void> {
        this.cachedTools = null;
        await this.transport.stop();
    }

    /** Extract the result from a JSON-RPC response, or throw on error.
     *  Generic parameter T lets callers get typed results without extra casts. */
    private unwrap<T>(response: JsonRpcResponse): T {
        if (isJsonRpcError(response)) {
            throw new Error(`MCP error ${response.error.code}: ${response.error.message}`);
        }
        return response.result as T;
    }
}
