// src/commands/scan.ts
// Scan management REPL commands. Parses the "scan" subcommand and its
// arguments, then delegates to the appropriate RavenHelpers method.
// All output goes directly to console for the interactive REPL.

import type { RavenHelpers } from "../client/helpers";

/** Dispatch a "scan <subcommand> [args]" REPL input to the right helper.
 *  @param helpers  - RavenHelpers instance connected to the server
 *  @param parts    - Tokenised REPL input (e.g. ["scan", "launch", "nmap", "127.0.0.1"])
 *  @param c        - ANSI colour map for formatted output */
export async function handleScanCommand(
    helpers:    RavenHelpers,
    parts:      string[],
    c:          Record<string, string>,
): Promise<void> {
    const sub   = parts[1];  // subcommand: launch, status, results, cancel, list
    const arg   = parts[2];  // primary argument (tool name or scan ID)

    switch (sub) {
        case "launch": {
            // Requires both a tool name and a target
            const target = parts[3];
            if (!arg || !target) {
                console.log(`${c.label}Usage:${c.reset} scan launch <tool> <target> [timeout_secs=N]`);
                return;
            }
            // Check remaining args for an optional timeout override
            const opts      = parts.slice(4);
            const timeout   = opts.find(s => s.startsWith("timeout_secs="));
            const secs      = timeout ? Number(timeout.split("=")[1]) : undefined;
            if (secs !== undefined && isNaN(secs)) {
                console.log(`${c.label}Error:${c.reset} timeout_secs must be a number`);
                return;
            }
            const result    = await helpers.launchScan(arg, target, secs);
            console.log(result);
            return;
        }
        case "status":
            if (!arg) {
                console.log(`${c.label}Usage:${c.reset} scan status <scan_id>`);
                return;
            }
            console.log(await helpers.getScanStatus(arg));
            return;

        case "results": {
            if (!arg) {
                console.log(`${c.label}Usage:${c.reset} scan results <scan_id> [offset=N] [limit=N]`);
                return;
            }
            // Parse optional pagination arguments from remaining tokens
            const resOpts   = parts.slice(3);
            const offsetStr = resOpts.find(s => s.startsWith("offset="));
            const limitStr  = resOpts.find(s => s.startsWith("limit="));
            const offset    = offsetStr ? Number(offsetStr.split("=")[1]) : undefined;
            const limit     = limitStr  ? Number(limitStr.split("=")[1])  : undefined;
            if ((offset !== undefined && isNaN(offset)) || (limit !== undefined && isNaN(limit))) {
                console.log(`${c.label}Error:${c.reset} offset and limit must be numbers`);
                return;
            }
            console.log(await helpers.getScanResults(arg, offset, limit));
            return;
        }

        case "cancel":
            if (!arg) {
                console.log(`${c.label}Usage:${c.reset} scan cancel <scan_id>`);
                return;
            }
            console.log(await helpers.cancelScan(arg));
            return;

        case "list":
            console.log(await helpers.listScans());
            return;

        default:
            // No recognised subcommand - show usage hint
            console.log(`${c.label}Usage:${c.reset} scan <launch|status|results|cancel|list>`);
    }
}
