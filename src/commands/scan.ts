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
            const secs = numOpt(parts.slice(4), "timeout_secs");
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
            const resOpts = parts.slice(3);
            const offset  = numOpt(resOpts, "offset");
            const limit   = numOpt(resOpts, "limit");
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

/** Read an optional `name=<number>` token from a list. Returns the parsed
 *  number, undefined if the token is absent, or NaN if present but non-numeric
 *  (the caller reports that). Splits with slice so a value that itself contains
 *  "=" survives, matching parseArgs' behaviour. */
function numOpt(tokens: string[], name: string): number | undefined {
    const hit = tokens.find(s => s.startsWith(`${name}=`));
    return hit ? Number(hit.slice(name.length + 1)) : undefined;
}
