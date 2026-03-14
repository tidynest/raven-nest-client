// src/types/mcp.ts
// MCP protocol types - methods and structures specific to Model Context Protocol (MCP).

/** Client capabilities sent during the MCP handshake. */
export interface ClientCapabilities {
    roots?: { listChanged?: boolean };
}

/** Server capabilities returned during the MCP handshake. */
export interface ServerCapabilities {
    tools?: { listChanged?: boolean };
}

/** The initialise response from the server. */
export interface InitialiseResult {
    protocolVersion: string;
    capabilities: ServerCapabilities;
    serverInfo: {
        name: string;
        version: string;
    };
}

/** A single tool the server exposes. */
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties?: Record<string, unknown>;
        required?: string[];
    };
}

/** Response from tools/list */
export interface ToolListResult {
    tools: ToolDefinition[];
}

/** A content block inside a tool call response */
export interface TextContent {
    type: "text";
    text: string;
}

/** Response from tools/call */
export interface ToolCallResult {
    content: TextContent[];
    isError?: boolean;
}
