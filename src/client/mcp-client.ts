// src/client/mcp-client.ts
// High-level MCP client — wraps StdioTransport into a clean API.
// Handles the two-step handshake (initialize → notifications/initialized)
// and exposes typed methods for tool discovery and invocation.

import { StdioTransport } from "./transport";
import { isJsonRpcError } from "../types";
import type {
    JsonRpcResponse,
    InitialiseResult,
    ToolListResult,
    ToolCallResult,
} from "../types";

export class McpClient {
    private transport: StdioTransport;

    constructor(binPath: string) {
        this.transport = new StdioTransport(binPath);
    }

    /** Start the server process and complete the MCP handshake.
     *
     *  The MCP handshake is two steps:
     *  1. Client sends "initialize" with its capabilities and protocol version
     *  2. Client sends "notifications/initialized" to signal readiness
     *  Only after step 2 can the client call tools. */
    async connect(): Promise<InitialiseResult> {
        await this.transport.start();

        // Step 1 — negotiate protocol version and exchange capabilities
        const response = await this.transport.request("initialize", {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "raven-nest-client", version: "0.1.0" },
        });

        const result = this.unwrap<InitialiseResult>(response);

        // Step 2 — tell the server we're ready (notification = no response)
        await this.transport.notify("notifications/initialized");

        return result;
    }

    /** Fetch every tool the server exposes, with names, descriptions, and schemas */
    async listTools(): Promise<ToolListResult> {
        const response = await this.transport.request("tools/list");
        return this.unwrap<ToolListResult>(response);
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

    /** Shut down the transport and kill the server process */
    async disconnect(): Promise<void> {
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
