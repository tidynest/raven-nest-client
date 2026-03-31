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
        const text   = this.unwrapText(result, "save_finding");
        // Server responds with "Finding saved. ID: <uuid>" - strip the prefix
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
        const text   = this.unwrapText(result, "delete_finding");
        // Server says "deleted" in the response text when successful
        return text.includes("deleted");
    }

    /** Generate a Markdown report of all saved findings.
     *  Optionally pass a custom title for the report header. */
    async generateReport(title?: string): Promise<string> {
        const args: Record<string, unknown> = {};
        if (title) args.title = title;
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

    /** Extract the first text content block from a tool result, or throw if
     *  the server flagged the result as an error. Centralises the isError
     *  check so individual methods can't accidentally ignore failures. */
    private unwrapText(result: ToolCallResult, context: string): string {
        if (result.isError) {
            throw new Error(result.content[0]?.text ?? `${context} failed`);
        }
        return result.content[0]?.text ?? "";
    }
}
