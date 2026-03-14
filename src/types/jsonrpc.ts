// src/types/jsonrpc.ts
// JSON-RPC 2.0 base types - the wire protocol beneath MCP

/** Every JSON-RPC message carries this version string */
export const JSONRPC_VERSION = "2.0" as const;

/** Outgoing request to the MCP server */
export interface JsonRpcRequest {
    jsonrpc: typeof JSONRPC_VERSION;
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
}

/** Successful response */
export interface JsonRpcSuccessResponse {
    jsonrpc: typeof JSONRPC_VERSION;
    id: string | number;
    result: unknown;
}

/** Error detail from the server */
export interface JsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}

/** Error response */
export interface JsonRpcErrorResponse {
    jsonrpc: typeof JSONRPC_VERSION;
    id: string | number | null;
    error: JsonRpcError;
}

/** A response is either a success or an error - never both */
export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

/** Type guard: narrows a response to the error variant */
export function isJsonRpcError(
    response: JsonRpcResponse,
): response is JsonRpcErrorResponse {
    return "error" in response;
}
