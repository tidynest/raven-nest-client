// Generates the README status badges as self-hosted SVGs.
//
// Why: GitHub proxies third-party images through its Camo cache, which was
// timing out against shields.io and rendering the badges broken. Repo-relative
// SVGs are served first-party by GitHub, so they can't break. This generator is
// the single source of truth: the release badge tracks package.json, and the
// tool-count badge tracks TOOL_COUNT below — nobody hand-edits SVG geometry.
//
// Run: `bun run badges`. Also runs automatically on `npm version`.

import pkg from "../package.json";

/** Server tool surface shown on the "MCP tools" badge. Bump when it changes. */
export const TOOL_COUNT = 46;

const COLORS = { blue: "#007ec6", orange: "#fe7d37", violet: "#8a2be2" };

const esc = (s: string): string =>
    s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Approx advance width (px) of one char in 11px Verdana, bucketed and biased
// slightly high so text always clears its rect with padding to spare.
const charW = (ch: string): number => {
    if (".:,;|il'!".includes(ch)) return 3.5;
    if ("mwMW".includes(ch)) return 10;
    if (ch === " ") return 4;
    if (ch >= "A" && ch <= "Z") return 7.6;
    return 6.9; // lowercase, digits, default
};
const textW = (s: string): number => [...s].reduce((w, c) => w + charW(c), 0);

const PAD = 11; // px of padding on each side of the text within a segment

/** One flat-square badge: gray label segment | colored message segment. */
export const badge = (label: string, message: string, color: string): string => {
    const lw = Math.round(textW(label) + PAD * 2);
    const mw = Math.round(textW(message) + PAD * 2);
    const [lx, mx] = [lw / 2, lw + mw / 2];
    const aria = esc(`${label}: ${message}`);
    const [l, m] = [esc(label), esc(message)];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + mw}" height="20" role="img" aria-label="${aria}">
  <title>${aria}</title>
  <g shape-rendering="crispEdges">
    <rect width="${lw}" height="20" fill="#555"/>
    <rect x="${lw}" width="${mw}" height="20" fill="${color}"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${lx}" y="15" fill="#010101" fill-opacity=".3">${l}</text>
    <text x="${lx}" y="14">${l}</text>
    <text x="${mx}" y="15" fill="#010101" fill-opacity=".3">${m}</text>
    <text x="${mx}" y="14">${m}</text>
  </g>
</svg>
`;
};

/** All badge files as { filename: svg }, derived from the given sources. */
export const buildBadges = (version: string, toolCount: number): Record<string, string> => ({
    "license-mit.svg": badge("License", "MIT", COLORS.blue),
    "release.svg": badge("release", `v${version}`, COLORS.orange),
    "mcp-tools.svg": badge("MCP tools", String(toolCount), COLORS.violet),
    "mcp-client.svg": badge("Model Context Protocol", "client", COLORS.blue),
});

if (import.meta.main) {
    const dir = new URL("../badges/", import.meta.url);
    const badges = buildBadges(pkg.version, TOOL_COUNT);
    await Promise.all(Object.entries(badges).map(([name, svg]) => Bun.write(new URL(name, dir), svg)));
    console.log(`Generated ${Object.keys(badges).length} badges (v${pkg.version}, ${TOOL_COUNT} tools)`);
}
