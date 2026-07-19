import { test, expect } from "bun:test";
import { badge, buildBadges } from "./gen-badges";

test("release badge tracks the given version", () => {
    expect(buildBadges("9.9.9", 43)["release.svg"]).toContain(">v9.9.9<");
});

test("tool-count badge tracks the given count", () => {
    expect(buildBadges("1.0.0", 77)["mcp-tools.svg"]).toContain(">77<");
});

test("total width equals label + message segments", () => {
    const svg = badge("MCP tools", "43", "#8a2be2");
    const total = Number(svg.match(/width="(\d+)" height="20" role/)![1]);
    const [lw, mw] = [...svg.matchAll(/<rect (?:x="\d+" )?width="(\d+)" height="20"/g)].map((m) => Number(m[1]));
    expect(total).toBe(lw + mw);
});

test("special chars are XML-escaped", () => {
    expect(badge("a&b", "<c>", "#000")).toContain("a&amp;b");
});
