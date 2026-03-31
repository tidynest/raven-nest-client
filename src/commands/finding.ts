// src/commands/finding.ts
// Finding management REPL commands. Parses the "finding" subcommand
// and its arguments, then delegates to the appropriate RavenHelpers method.
// The "save" subcommand accepts key=value pairs for all finding fields.

import type { RavenHelpers} from "../client/helpers";
import type { SaveFindingParams } from "../types";

/** Dispatch a "finding <subcommand> [args]" REPL input to the right helper.
 *  @param helpers  - RavenHelpers instance connected to the server
 *  @param parts    - Tokenised REPL input (e.g. ["finding", "get", "<uuid>"])
 *  @param c        - ANSI colour map for formatted output */
export async function handleFindingCommand(
    helpers:    RavenHelpers,
    parts:      string[],
    c:          Record<string, string>,
): Promise<void> {
    const sub = parts[1];  // subcommand: save, get, delete
    const arg = parts[2];  // primary argument (finding ID for get/delete)

    switch (sub) {
        case "save": {
            // Parse all key=value pairs from the remaining tokens
            const params = parseArgs(parts.slice(2));

            // Validate that all required fields are present
            if (!params.title || !params.severity || !params.description ||
                !params.target || !params.tool) {
                console.log(`${c.label}Usage:${c.reset} finding save
                title=... severity=... description=... target=...
                tool=... [evidence=...] [remediation=...] [cvss=...] [cve=...] [owasp_category=...]`);
                return;
            }

            // Build typed params - convert cvss from string to number if present
            // (parseArgs returns all strings, but SaveFindingParams.cvss expects number)
            const typed: Record<string, unknown> = { ...params };
            if (typed.cvss) {
                typed.cvss = Number(typed.cvss);
                if (isNaN(typed.cvss as number)) {
                    console.log(`${c.err}Error:${c.reset} cvss must be a number`);
                    return;
                }
            }
            const result = await helpers.saveFinding(typed as SaveFindingParams);
            console.log(`${c.ok}Saved:${c.reset} ${result}`);
            return;
        }
        case "get":
            if (!arg) {
                console.log(`${c.label}Usage:${c.reset} finding get <id>`);
                return;
            }
            console.log(await helpers.getFinding(arg));
            return;

        case "delete":
            if (!arg) {
                console.log(`${c.label}Usage:${c.reset} finding delete <id>`);
                return;
            }
            const deleted = await helpers.deleteFinding(arg);
            console.log(deleted ? `${c.ok}Deleted${c.reset}` : `${c.err}Not found${c.reset}`);
            return;

        default:
            // No recognised subcommand - show usage hint
            console.log(`${c.label}Usage:${c.reset} finding <save|get|delete>`);
    }
}

/** Parse "key=value" pairs into an object. Splits only on the first "="
 *  so values containing "=" (like base64 strings) are preserved intact.
 *  Pairs without "=" are silently skipped.
 *  Shared by both the REPL entry point and command handlers. */
export function parseArgs(pairs: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const pair of pairs) {
        const eq = pair.indexOf("=");
        if (eq === -1) continue;
        result[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    return result;
}
