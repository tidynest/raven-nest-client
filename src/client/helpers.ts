// src/client/helpers.ts
// Typed convenience wrappers around McpClient for finding and scan operations.
// Uses composition - delegates to McpClient.callTool() internally. Each method
// handles argument assembly and response text extraction so callers don't
// need to know the raw tool names or response format.

import type { McpClient } from "./mcp-client";
import type { SaveFindingParams, ToolCallResult } from "../types";

export class RavenHelpers {
    /** Creates a new helper instance wrapping the given MCP client.
     *  All operations delegate to client.callTool() under the hood. */
    constructor(private client: McpClient) {}

    /** Save a vulnerability finding and return its server-assigned UUID. */
    async saveFinding(params: SaveFindingParams): Promise<string> {
        const result = await this.client.callTool("save_finding", { ...params });
        // Prefer the structured finding_id; fall back to parsing the text.
        const id = this.structured<string>(result, "finding_id");
        if (id) return id;
        const text = this.unwrapText(result, "save_finding");
        return text.replace("Finding saved. ID: ", "");
    }

    /** Retrieve a finding by ID. Returns the raw server text (formatted finding details). */
    async getFinding(id: string): Promise<string> {
        const result = await this.client.callTool("get_finding", { finding_id: id });
        return this.unwrapText(result, "get_finding");
    }

    /** List all saved findings. Returns server-formatted text listing. */
    async listFindings(): Promise<string> {
        const result = await this.client.callTool("list_findings");
        return this.unwrapText(result, "list_findings");
    }

    /** Delete a finding by ID. Returns true if the finding existed and was removed. */
    async deleteFinding(id: string): Promise<boolean> {
        const result = await this.client.callTool("delete_finding", { finding_id: id });
        // Prefer the structured `deleted` flag; fall back to text matching.
        const deleted = this.structured<boolean>(result, "deleted");
        if (deleted !== undefined) return deleted;
        const text = this.unwrapText(result, "delete_finding");
        return text.includes("deleted");
    }

    /** Generate a report of all saved findings. Optionally pass a custom title
     *  and a format (markdown default; json|sarif|html). The server validates
     *  the format and owns the output path. */
    async generateReport(title?: string, format?: string): Promise<string> {
        const args: Record<string, unknown> = {};
        if (title)  args.title  = title;
        if (format) args.format = format;
        const result = await this.client.callTool("generate_report", args);
        return this.unwrapText(result, "generate_report");
    }

    /** Launch a background scan and return the raw server response.
     *  The response contains the scan UUID needed for status/results/cancel. */
    async launchScan(tool: string, target: string, timeoutSecs?: number): Promise<string> {
        const args: Record<string, unknown> = { tool, target };
        if (timeoutSecs !== undefined) args.timeout_secs = timeoutSecs;
        const result = await this.client.callTool("launch_scan", args);
        return this.unwrapText(result, "launch_scan");
    }

    /** Check the current status of a background scan (Running/Completed/Failed/Cancelled). */
    async getScanStatus(scanId: string): Promise<string> {
        const result = await this.client.callTool("get_scan_status", { scan_id: scanId });
        return this.unwrapText(result, "get_scan_status");
    }

    /** Retrieve scan output with optional pagination.
     *  Large scan results can be fetched in pages using offset and limit. */
    async getScanResults(scanId: string, offset?: number, limit?: number): Promise<string> {
        const args: Record<string, unknown> = { scan_id: scanId };
        if (offset !== undefined) args.offset = offset;
        if (limit  !== undefined) args.limit  = limit;
        const result = await this.client.callTool("get_scan_results", args);
        return this.unwrapText(result, "get_scan_results");
    }

    /** Cancel a running background scan. No-op if the scan already finished. */
    async cancelScan(scanId: string): Promise<string> {
        const result = await this.client.callTool("cancel_scan", { scan_id: scanId });
        return this.unwrapText(result, "cancel_scan");
    }

    /** List all background scans (running and completed). */
    async listScans(): Promise<string> {
        const result = await this.client.callTool("list_scans");
        return this.unwrapText(result, "list_scans");
    }

    /** Switch/create the active engagement. Returns the server's confirmation text.
     *  Scopes subsequent findings + reports to that engagement's directory. */
    async setEngagement(name: string): Promise<string> {
        const result = await this.client.callTool("set_engagement", { name });
        return this.unwrapText(result, "set_engagement");
    }

    /** List engagements (human-readable text). */
    async listEngagements(): Promise<string> {
        const result = await this.client.callTool("list_engagements");
        return this.unwrapText(result, "list_engagements");
    }

    /** The active engagement name, read from list_engagements' structuredContent.
     *  Returns undefined when none is active. Used to render the REPL prompt. */
    async activeEngagement(): Promise<string | undefined> {
        const result = await this.client.callTool("list_engagements");
        return this.structured<string | null>(result, "active") ?? undefined;
    }

    /** Invoke any server tool by name and return its first text block. Generic
     *  escape hatch for callers that drive tools without a dedicated typed
     *  wrapper (e.g. the recon workflow chaining nmap -> whatweb). Throws on
     *  isError, like the typed methods. */
    async callText(tool: string, args: Record<string, unknown> = {}): Promise<string> {
        const result = await this.client.callTool(tool, args);
        return this.unwrapText(result, tool);
    }

    /** Extract the first text content block from a tool result, or throw if
     *  the server flagged the result as an error. Centralises the isError
     *  check so individual methods can't accidentally ignore failures. */
    private unwrapText(result: ToolCallResult, context: string): string {
        if (result.isError) {
            throw new Error(result.content[0]?.text ?? `${context} failed`);
        }
        return result.content[0]?.text ?? "";
    }

    /** Read a single field from the result's structuredContent, if the server
     *  provided one. Returns undefined when absent so callers can fall back to
     *  parsing the human-readable text. */
    private structured<T>(result: ToolCallResult, key: string): T | undefined {
        return result.structuredContent?.[key] as T | undefined;
    }
}
