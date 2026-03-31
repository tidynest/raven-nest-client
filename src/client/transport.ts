// src/client/transport.ts
// Stdio transport - spawns the Rust MCP server binary and speaks JSON-RPC 2.0
// over its stdin/stdout pipes. Each request gets a unique ID; the readLoop
// matches incoming responses to their waiting Promises via the pending Map.

import type { Subprocess } from "bun";
import {
    JSONRPC_VERSION,
    type JsonRpcRequest,
    type JsonRpcResponse,
    type JsonRpcMessage,
} from "../types";
import { SERVER_CONFIG } from "../config";

export class StdioTransport {
    // The child process handle - null until start() is called
    private proc: Subprocess<"pipe", "pipe", "pipe"> | null = null;

    // Monotonically increasing counter so every request gets a unique id
    private requestId = 0;

    // Maps request ids to Promise callbacks. When readLoop receives a response
    // whose id matches a pending entry, it resolves that Promise and deletes it.
    private pending = new Map<
        string | number,
        {
            resolve: (value: JsonRpcResponse) => void;
            reject: (error: Error) => void;
            timer: ReturnType<typeof setTimeout>;
        }
    >();

    // Accumulates partial stdout chunks until a full newline-delimited JSON
    // message is available (the server sends one JSON object per line)
    private buffer = "";

    // Captures stderr output from the server process. Bounded to prevent
    // unbounded memory growth from verbose tools (nmap, nikto, etc.)
    private stderrLines: string[] = [];
    private readonly STDERR_MAX = 100;

    // Optional callback for server-initiated notifications (no id field).
    // Set via onNotification() - null means notifications are silently dropped.
    private notificationHandler?: (method: string, params?: Record<string, unknown>) => void;

    // Timeout duration in milliseconds. Set to match the server's
    // default_timeout_secs of 2 minutes (2 * 60s * 1000ms).
    private defaultTimeout = 120_000;

    /** Creates a new transport instance pointing at the given server binary.
     *  Does not spawn the process yet - call start() to do that.
     *  Optional timeout overrides the default 120s per-request deadline. */
    constructor(private binPath: string, timeout?: number) {
        if (timeout !== undefined) this.defaultTimeout = timeout;
    }

    /** Spawn the Rust binary and kick off the background stdout reader.
     *  All three stdio channels are piped so we own the full data flow. */
    async start(): Promise<void> {
        // Verify the binary exists before attempting to spawn
        if (!await Bun.file(this.binPath).exists()) {
            throw new Error(`Server binary not found: ${this.binPath}`);
        }

        this.proc = Bun.spawn([this.binPath], {
            stdin: "pipe",   // we write JSON-RPC requests here
            stdout: "pipe",  // server writes JSON-RPC responses here
            stderr: "pipe",  // captured by stderrLoop into bounded buffer
            env: { ...process.env, RAVEN_CONFIG: SERVER_CONFIG },
        });

        // Fire-and-forget: readLoop runs in the background for the lifetime
        // of the process, resolving Promises as responses arrive.
        //
        // `void` tells the IDE this is intentionally unawaited. Similar to
        // Rust's `let _ = ...` pattern for ignoring a value on purpose.
        void this.readLoop();
        void this.stderrLoop();
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
            ...(params !== undefined && {params}),
        };

        // Newline-delimited JSON - one complete message per line
        const payload = JSON.stringify(msg) + "\n";
        this.proc.stdin.write(payload);
        this.proc.stdin.flush();

        // Creates a timeout timer that starts immediately and is stored alongside
        // the resolve/reject callbacks. If a response arrives in time, readLoop
        // resolves the promise and clears the timer. If not, the timer fires,
        // removes the dead entry from the map, and rejects with a clear message.
        //
        // Same pattern as Rust's `tokio::time::timeout` wrapping a
        // `oneshot::Receiver` - the timeout races against the actual response.
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Request ${id} timed out after ${this.defaultTimeout}ms`));
            }, this.defaultTimeout);

            this.pending.set(id, {resolve, reject, timer});
        });
    }

    /** Send a JSON-RPC notification - fire-and-forget, no id field, no response.
     *  MCP uses this for "notifications/initialised" after the handshake. */
    async notify(method: string, params?: Record<string, unknown>): Promise<void> {
        if (!this.proc) throw new Error("Transport not started");

        // Notifications omit the `id` field - the server must not reply
        const msg = {
            jsonrpc: JSONRPC_VERSION,
            method,
            ...(params !== undefined && {params}),
        };

        const payload = JSON.stringify(msg) + "\n";
        this.proc.stdin.write(payload);
        this.proc.stdin.flush();
    }

    /** Tear down: reject any in-flight requests, then kill the child process. */
    async stop(): Promise<void> {
        // Any requests still waiting will never get a response - reject them
        for (const [, {reject, timer}] of this.pending) {
            clearTimeout(timer);
            reject(new Error("Transport stopped"));
        }
        this.pending.clear();

        this.proc?.kill();
        this.proc = null;
    }

    /** Returns a snapshot of captured stderr lines (most recent up to STDERR_MAX). */
    getStderr(): string[] {
        // Spread `[...]` returns a copy so callers can't mutate the internal buffer.
        // Like Rust's `.clone()` on a `Vec` - defensive by default.
        return [...this.stderrLines];
    }

    /** Reset the timeout timer on all pending requests. Called when a progress
     *  notification arrives so long-running tools (nmap, nikto, sqlmap) don't
     *  timeout while actively reporting progress. Each call restarts the full
     *  timeout window for every in-flight request. */
    resetPendingTimers(): void {
        for (const [id, entry] of this.pending) {
            clearTimeout(entry.timer);
            entry.timer = setTimeout(() => {
                this.pending.delete(id);
                entry.reject(new Error(`Request ${id} timed out after ${this.defaultTimeout}ms`));
            }, this.defaultTimeout);
        }
    }

    /** Register a callback for server-initiated notifications.
     *  The server sends progress updates via "notifications/message"
     *  during long-running tool executions. */
    onNotification(handler: (method: string, params?: Record<string, unknown>) => void):
        void {
        this.notificationHandler = handler;
    }

    /** Background loop: reads stdout chunks, splits on newlines, parses each
     *  line as JSON-RPC, and resolves the matching pending Promise.
     *
     *  Why a manual buffer? Bun streams deliver arbitrary byte chunks -
     *  a single chunk may contain half a line, one line, or several.
     *  We accumulate into `this.buffer` and extract complete lines. */
    private async readLoop(): Promise<void> {
        if (!this.proc?.stdout) return;

        const decoder = new TextDecoder();
        const reader = this.proc.stdout.getReader();

        try {
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;  // server closed stdout (process exiting)

                // Append chunk; { stream: true } handles multibyte characters
                // that might be split across chunk boundaries
                this.buffer += decoder.decode(value, {stream: true});

                // Extract every complete line from the buffer
                let newlineIdx: number;
                while ((newlineIdx = this.buffer.indexOf("\n")) !== -1) {
                    const line = this.buffer.slice(0, newlineIdx).trim();
                    this.buffer = this.buffer.slice(newlineIdx + 1);

                    if (!line) continue;  // skip blank lines between messages

                    try {
                        const response = JSON.parse(line) as JsonRpcMessage;

                        // Dispatch server-initiated notifications (no id field).
                        // These are progress ticks, log messages, etc.
                        if (!("id" in response)) {
                            this.notificationHandler?.(response.method, response.params);
                            continue;
                        }

                        // Skip error responses with null id (parse errors, etc.)
                        if (response.id == null) continue;

                        // Look up and resolve the Promise that request() created
                        const pending = this.pending.get(response.id);
                        if (pending) {
                            clearTimeout(pending.timer);
                            this.pending.delete(response.id);
                            pending.resolve(response);
                        }
                    } catch (err) {
                        // Log but don't rethrow - one malformed line shouldn't kill the read loop
                        console.error("Failed to parse server output:", err);
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    /** Background loop: reads stderr line-by-line into a bounded buffer.
     *  Mirrors readLoop() but doesn't parse JSON - just captures raw text
     *  for diagnostics (e.g. tool warnings, server debug output). */
    private async stderrLoop(): Promise<void> {
        if (!this.proc?.stderr) return;

        const decoder = new TextDecoder();
        const reader = this.proc.stderr.getReader();
        let stderrBuffer = "";

        try {
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;

                stderrBuffer += decoder.decode(value, {stream: true});

                // Same line-extraction logic as readLoop
                let newLineIdx: number;
                while ((newLineIdx = stderrBuffer.indexOf("\n")) !== -1) {
                    const line = stderrBuffer.slice(0, newLineIdx).trim();
                    stderrBuffer = stderrBuffer.slice(newLineIdx + 1);

                    if (!line) continue;

                    // Push into bounded ring buffer - drop oldest line if full
                    this.stderrLines.push(line);
                    if (this.stderrLines.length > this.STDERR_MAX) this.stderrLines.shift();
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}
