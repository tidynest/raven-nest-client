// src/commands/engagement.ts
// Engagement management REPL commands. An engagement scopes findings and
// reports to {output_dir}/engagements/{name}/ on the server. Mirrors the
// finding/scan command dispatchers - the server owns all the logic.

import type { RavenHelpers } from "../client/helpers";

/** Dispatch "engagement <set|list>". Returns the active engagement name
 *  after the command (for prompt refresh), or undefined if unchanged/none. */
export async function handleEngagementCommand(
    helpers: RavenHelpers,
    parts:   string[],
    c:       Record<string, string>,
): Promise<string | undefined> {
    const sub  = parts[1];
    const name = parts[2];
    switch (sub) {
        case "set":
            if (!name) { console.log(`${c.label}Usage:${c.reset} engagement set <name>`); return undefined; }
            console.log(`${c.ok}${await helpers.setEngagement(name)}${c.reset}`);
            return name;                       // new active
        case "list":
            console.log(await helpers.listEngagements());
            return await helpers.activeEngagement();
        default:
            console.log(`${c.label}Usage:${c.reset} engagement <set|list>`);
            return undefined;
    }
}
