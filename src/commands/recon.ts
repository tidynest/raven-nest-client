// src/commands/recon.ts
// Deterministic recon workflow: discover open ports with nmap, then run the
// web-layer tools against whatever HTTP(S) ports nmap found. This is a fixed
// pipeline the operator triggers with one command - NOT an agentic loop. The
// server stays the source of truth for each tool; recon only chains them and
// filters between stages.

import type { RavenHelpers } from "../client/helpers";

/** A port nmap reported open, with its detected service name (may be ""). */
export interface OpenPort { port: number; service: string; }

/** Parse open ports + service names from run_nmap's text output. The server
 *  prints one row per port as "{portid}/{proto}  {state}  {service}  {version}",
 *  e.g. "80/tcp   open     http". Closed ports and headers are skipped. */
export function parseOpenPorts(nmapText: string): OpenPort[] {
    const ports: OpenPort[] = [];
    for (const line of nmapText.split("\n")) {
        const m = line.match(/^\s*(\d+)\/tcp\s+open\s+(\S+)?/);
        if (m) ports.push({ port: Number(m[1]), service: m[2] ?? "" });
    }
    return ports;
}

// ── The one decision worth tuning yourself ──────────────────────────────────
/** Decide which open ports are "web" and worth running HTTP tools against.
 *  This is the interesting business logic of the workflow - there are several
 *  valid strategies, so it lives in its own function for you to shape.
 *
 *  Default: trust nmap's service name when it looks like http, OR fall back to
 *  a set of common web ports (covers a quick scan that skips service detection).
 *
 *  TODO(you): tune to your targets. Trade-offs to weigh -
 *   - service-only (`p.service.startsWith("http")`): precise with scan_type
 *     "service", but a fast/quick scan reports no service and you'd miss ports;
 *   - port-only: catches bare ports but mislabels a non-web service on :8080;
 *   - add ports your environment actually uses (8081, 9000, …) or drop ones
 *     you never want auto-scanned. */
export function selectWebPorts(ports: OpenPort[]): OpenPort[] {
    const COMMON_WEB = new Set([80, 443, 8080, 8443, 3000, 8000, 8888]);
    return ports.filter(p => p.service.startsWith("http") || COMMON_WEB.has(p.port));
}

/** True for ports we should address over TLS. */
function isTls(p: OpenPort): boolean {
    return p.port === 443 || p.port === 8443 || p.service.includes("https") || p.service.includes("ssl");
}

/** Run the recon pipeline against a single target.
 *  Stage 1: nmap service scan -> open ports. Stage 2: whatweb each web port. */
export async function handleReconCommand(
    helpers: RavenHelpers,
    parts:   string[],
    c:       Record<string, string>,
): Promise<void> {
    const target = parts[1];
    if (!target) {
        console.log(`${c.label}Usage:${c.reset} recon <target>`);
        return;
    }

    // Stage 1 - discover ports. scan_type "service" so we get service names
    // for the filter below.
    console.log(`${c.label}[recon]${c.reset} nmap ${target} (service scan)…`);
    const nmapText = await helpers.callText("run_nmap", { target, scan_type: "service" });
    console.log(nmapText);

    const open = parseOpenPorts(nmapText);
    const web  = selectWebPorts(open);
    console.log(
        `${c.label}[recon]${c.reset} ${open.length} open port(s); ` +
        `${web.length} look web-facing: ${web.map(p => p.port).join(", ") || "none"}`,
    );
    if (web.length === 0) {
        console.log(`${c.dim}No web ports to follow up - recon complete.${c.reset}`);
        return;
    }

    // Stage 2 - fingerprint each web port with whatweb. One tool failing must
    // not abort the rest of the sweep.
    for (const p of web) {
        const url = `${isTls(p) ? "https" : "http"}://${target}:${p.port}`;
        console.log(`\n${c.label}[recon]${c.reset} whatweb ${url}`);
        try {
            console.log(await helpers.callText("run_whatweb", { target: url }));
        } catch (err) {
            console.log(`${c.err}whatweb failed:${c.reset} ${(err as Error).message}`);
        }
    }
    console.log(`\n${c.ok}[recon] done.${c.reset} ${web.length} web port(s) fingerprinted.`);
}
