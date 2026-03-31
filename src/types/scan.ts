// src/types/scan.ts
// Scan management types - mirrors raven-core's ScanManager and the
// server's scan tool request structures. These types are used by the
// helpers layer and command handlers to build typed scan operations.

/** Background scan lifecycle states - matches raven-core's ScanStatus enum. */
export type ScanStatus = "Running" | "Completed" | "Failed" | "Cancelled";

/** Parameters for the "launch_scan" tool.
 *  Starts a background scan using the specified security tool. */
export interface LaunchScanParams {
    /** Name of the security tool to run (e.g. "nmap", "nikto", "sqlmap") */
    tool:           string;
    /** Target host, IP, or URL to scan */
    target:         string;
    /** Optional timeout in seconds before the scan is forcefully killed */
    timeout_secs?:  number;
}

/** Parameters for "get_scan_status" and "cancel_scan" tools.
 *  Both only need the scan's UUID to operate. */
export interface ScanIdParams {
    /** UUID returned by launch_scan */
    scan_id: string;
}

/** Parameters for "get_scan_results" - supports paginated retrieval
 *  of scan output for large result sets. */
export interface ScanResultsParams {
    /** UUID of the scan to retrieve results from */
    scan_id: string;
    /** Number of lines to skip from the start of output */
    offset?: number;
    /** Maximum number of lines to return */
    limit?:  number;
}
