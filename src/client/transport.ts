// src/client/transport.ts
// Stdio transport — spawns the Rust MCP server binary and speaks JSON-RPC 2.0
// over its stdin/stdout pipes.  Each request gets a unique ID; the readLoop
// matches incoming responses to their waiting Promises via the pending Map.

import type { Subprocess } from "bun";
import {
    JSONRPC_VERSION,
    type JsonRpcRequest,
    type JsonRpcResponse,
    isJsonRpcError,
} from "../types";

export class StdioTransport {
    // The child process handle — null until start() is called
    private proc: Subprocess<"pipe", "pipe", "pipe"> | null = null;

    // Monotonically increasing counter so every request gets a unique id
    private requestId = 0;

    // Maps request ids → Promise callbacks. When readLoop receives a response
    // whose id matches a pending entry, it resolves that Promise and deletes it.
    private pending = new Map<
        string | number,
        {
            resolve: (value: JsonRpcResponse) => void;
            reject: (error: Error) => void;
        }
    >();

    // Accumulates partial stdout chunks until a full newline-delimited JSON
    // message is available (the server sends one JSON object per line)
    private buffer = "";

    constructor(private binPath: string) {}

    /** Spawn the Rust binary and kick off the background stdout reader.
     *  All three stdio channels are piped so we own the full data flow. */
    async start(): Promise<void> {
        if (!await Bun.file(this.binPath).exists()) {
            throw new Error(`Server binary not found: ${this.binPath}`);
        }

        this.proc = Bun.spawn([this.binPath], {
            stdin:  "pipe",   // we write JSON-RPC requests here
            stdout: "pipe",   // server writes JSON-RPC responses here
            stderr: "pipe",   // captured but unused — keeps server errors quiet
        });

        // Fire-and-forget: readLoop runs in the background for the
        // lifetime of the process, resolving Promises as responses arrive
        this.readLoop();
    }

    /** Send a JSON-RPC request and wait for the matching response.
     *  Returns a Promise that readLoop will resolve when the server replies. */
    async request(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
        if (!this.proc) throw new Error("Transport not started");

        const id = ++this.requestId;
        const msg: JsonRpcRequest = {
            jsonrpc: JSONRPC_VERSION,
            id,
            method,
            // Only include params key when caller supplied arguments
            ...(params !== undefined && { params }),
        };

        // Newline-delimited JSON — one complete message per line
        const payload = JSON.stringify(msg) + "\n";
        this.proc.stdin.write(payload);
        this.proc.stdin.flush();

        // Park a Promise in the pending Map keyed by this request's id.
        // readLoop will find it when the response arrives and resolve it.
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
        });
    }

    /** Send a JSON-RPC notification — fire-and-forget, no id field, no response.
     *  MCP uses this for "notifications/initialized" after the handshake. */
    async notify(method: string, params?: Record<string, unknown>): Promise<void> {
        if (!this.proc) throw new Error("Transport not started");

        // Notifications omit the `id` field — the server must not reply
        const msg = {
            jsonrpc: JSONRPC_VERSION,
            method,
            ...(params !== undefined && { params }),
        };

        const payload = JSON.stringify(msg) + "\n";
        this.proc.stdin.write(payload);
        this.proc.stdin.flush();
    }

    /** Tear down: reject any in-flight requests, then kill the child process */
    async stop(): Promise<void> {
        // Any requests still waiting will never get a response — reject them
        for (const [, { reject }] of this.pending) {
            reject(new Error("Transport stopped"));
        }
        this.pending.clear();

        this.proc?.kill();
        this.proc = null;
    }

    /** Background loop: reads stdout chunks, splits on newlines, parses each
     *  line as JSON-RPC, and resolves the matching pending Promise.
     *
     *  Why a manual buffer?  Bun streams deliver arbitrary byte chunks —
     *  a single chunk may contain half a line, one line, or several.
     *  We accumulate into `this.buffer` and extract complete lines. */
    private async readLoop(): Promise<void> {
        if (!this.proc?.stdout) return;

        const decoder = new TextDecoder();
        const reader  = this.proc.stdout.getReader();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;  // server closed stdout (process exiting)

                // Append chunk; { stream: true } handles multi-byte chars
                // that might be split across chunks
                this.buffer += decoder.decode(value, { stream: true });

                // Extract every complete line from the buffer
                let newlineIdx: number;
                while ((newlineIdx = this.buffer.indexOf("\n")) !== -1) {
                    const line = this.buffer.slice(0, newlineIdx).trim();
                    this.buffer = this.buffer.slice(newlineIdx + 1);

                    if (!line) continue;  // skip blank lines

                    try {
                        const response = JSON.parse(line) as JsonRpcResponse;

                        // Server-initiated notifications have no id — skip them
                        if (!("id" in response) || response.id == null) continue;

                        // Look up and resolve the Promise that request() created
                        const pending = this.pending.get(response.id);
                        if (pending) {
                            this.pending.delete(response.id);
                            pending.resolve(response);
                        }
                    } catch (err) {
                        // Log but don't rethrow — one malformed line shouldn't kill the read loop
                        console.error("Failed to parse server output:", err);
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}