// src/types/jsonrpc.ts
// JSON-RPC 2.0 base types - the wire protocol beneath MCP.
// All communication with the Rust server uses newline-delimited JSON-RPC
// over stdio pipes. These types enforce the structure of that wire format.

/** Every JSON-RPC message carries this version string. */
export const JSONRPC_VERSION = "2.0" as const;

/** Outgoing request to the MCP server. Each request must carry a unique
 *  `id` so the response can be matched back to the caller's Promise. */
export interface JsonRpcRequest {
    /** Protocol version - always "2.0" */
    jsonrpc: typeof JSONRPC_VERSION;
    /** Unique identifier for this request, used to correlate responses */
    id: string | number;
    /** The RPC method to invoke (e.g. "initialize", "tools/list", "tools/call") */
    method: string;
    /** Optional arguments for the method */
    params?: Record<string, unknown>;
}

/** Successful response - contains the method's return value in `result`. */
export interface JsonRpcSuccessResponse {
    /** Protocol version - always "2.0" */
    jsonrpc: typeof JSONRPC_VERSION;
    /** Matches the `id` from the originating request */
    id: string | number;
    /** The return value from the server method */
    result: unknown;
}

/** Structured error detail from the server. */
export interface JsonRpcError {
    /** Numeric error code (negative values are reserved by the JSON-RPC spec) */
    code: number;
    /** Human-readable error description */
    message: string;
    /** Optional additional data attached to the error */
    data?: unknown;
}

/** Error response - contains a structured error instead of a result. */
export interface JsonRpcErrorResponse {
    /** Protocol version - always "2.0" */
    jsonrpc: typeof JSONRPC_VERSION;
    /** Matches the originating request, or null for parse errors */
    id: string | number | null;
    /** Structured error with code, message, and optional data */
    error: JsonRpcError;
}

/** A response is either a success or an error, never both. */
export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

/** Server-initiated notification - has no `id` field, and the server must
 *  not expect a reply. Used for progress updates, logging, and other
 *  asynchronous messages during long-running tool executions. */
export interface JsonRpcNotification {
    /** Protocol version - always "2.0" */
    jsonrpc: typeof JSONRPC_VERSION;
    /** Notification type (e.g. "notifications/message" for progress ticks) */
    method:  string;
    /** Optional payload for the notification */
    params?: Record<string, unknown>;
}

/** Any message from the server: either a response to a request we sent,
 *  or an unsolicited notification the server pushed to us. */
export type JsonRpcMessage = JsonRpcResponse | JsonRpcNotification;

/** Type guard: narrows a JSON-RPC response to the error variant.
 *  Checks for the presence of the `error` key to discriminate. */
export function isJsonRpcError(
    response: JsonRpcResponse,
): response is JsonRpcErrorResponse {
    return "error" in response;
}
