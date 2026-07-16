// src/types/mcp.ts
// MCP (Model Context Protocol) types - methods and structures that sit
// on top of JSON-RPC. These define the handshake, tool discovery, tool
// invocation, and logging notification shapes used by the raven-nest server.

/** Server capabilities returned during the MCP handshake.
 *  Tells the client what features the server supports. */
export interface ServerCapabilities {
    /** Whether the server exposes tools and can notify when the list changes */
    tools?: { listChanged?: boolean };
    /** Whether the server supports sending log/progress notifications */
    logging?: {};
}

/** The initialise response from the server, returned after the first
 *  handshake step. Contains the negotiated protocol version, the
 *  server's capabilities, and basic identity information. */
export interface InitialiseResult {
    /** The MCP protocol version the server agreed to use */
    protocolVersion: string;
    /** Features the server supports */
    capabilities: ServerCapabilities;
    /** Name and version of the server implementation */
    serverInfo: {
        name: string;
        version: string;
    };
}

/** A single tool the server exposes. Discovered via "tools/list".
 *  The inputSchema describes what arguments the tool accepts. */
export interface ToolDefinition {
    /** Unique tool identifier (e.g. "ping_target", "launch_scan") */
    name: string;
    /** Human-readable explanation of what the tool does */
    description: string;
    /** JSON Schema describing the tool's accepted parameters */
    inputSchema: {
        type: "object";
        /** Map of parameter name to its JSON Schema definition */
        properties?: Record<string, unknown>;
        /** Parameter names that must be provided */
        required?: string[];
    };
}

/** Response payload from "tools/list". */
export interface ToolListResult {
    /** Array of all tools the server currently exposes */
    tools: ToolDefinition[];
}

/** A single content block inside a tool call response.
 *  Currently only "text" type is used by the raven-nest server. */
export interface TextContent {
    /** Content type discriminator */
    type: "text";
    /** The actual text payload returned by the tool */
    text: string;
}

/** Response payload from "tools/call". */
export interface ToolCallResult {
    /** One or more content blocks returned by the tool */
    content: TextContent[];
    /** True if the tool execution encountered an error */
    isError?: boolean;
    /** Optional machine-readable result (MCP structuredContent). The raven-nest
     *  server attaches this on finding/scan tools so clients can read fields
     *  (e.g. finding_id, deleted, scan_id) instead of parsing the human text. */
    structuredContent?: Record<string, unknown>;
}
