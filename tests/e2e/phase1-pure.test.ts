// Phase 1: Pure function tests - no server needed
// Validates tokenize(), coerceArgs(), and parseArgs() with zero external
// dependencies. tokenize/coerceArgs are imported straight from index.ts - its
// main() is guarded by import.meta.main, so importing never launches the CLI.

import { describe, test, expect } from "bun:test";
import { tokenize, coerceArgs } from "../../index";
import { parseArgs } from "../../src/commands/finding";
import { parseOpenPorts, selectWebPorts } from "../../src/commands/recon";

// -- Test 1a: tokenize() - quote-aware splitting --

describe("Phase 1a: tokenize()", () => {
    test("basic splitting", () => {
        const r = tokenize("call ping_target target=127.0.0.1");
        expect(r).toEqual(["call", "ping_target", "target=127.0.0.1"]);
    });

    test("double-quoted multi-word value", () => {
        const r = tokenize('finding save title="SQL Injection in Login" severity=high');
        expect(r).toEqual(["finding", "save", "title=SQL Injection in Login", "severity=high"]);
        expect(r.length).toBe(4);
    });

    test("single-quoted value preserves spaces", () => {
        const r = tokenize("finding save title='Hello World'");
        expect(r).toEqual(["finding", "save", "title=Hello World"]);
    });

    test("consecutive spaces produce no empty tokens", () => {
        const r = tokenize("call   ping_target   target=127.0.0.1");
        expect(r).toEqual(["call", "ping_target", "target=127.0.0.1"]);
    });

    test("empty string returns 0 tokens", () => {
        expect(tokenize("")).toEqual([]);
    });

    test("spaces-only string returns 0 tokens", () => {
        expect(tokenize("   ")).toEqual([]);
    });

    test("backslash escapes a quote inside a quoted value", () => {
        // input: title="SQL \"injection\""  ->  token: title=SQL "injection"
        const r = tokenize('finding save title="SQL \\"injection\\""');
        expect(r).toEqual(["finding", "save", 'title=SQL "injection"']);
    });

    test("backslash before a non-quote stays literal (paths survive)", () => {
        const r = tokenize("evidence=C:\\Users\\admin");
        expect(r).toEqual(["evidence=C:\\Users\\admin"]);
    });
});

// -- Test 1b: coerceArgs() - type coercion and NaN handling --

describe("Phase 1b: coerceArgs()", () => {
    test("integer coercion", () => {
        const tool = { inputSchema: { properties: { count: { type: "integer" } } } };
        const r = coerceArgs({ count: "5" }, tool);
        expect(r.count).toBe(5);
        expect(typeof r.count).toBe("number");
    });

    test("float coercion", () => {
        const tool = { inputSchema: { properties: { cvss: { type: "number" } } } };
        const r = coerceArgs({ cvss: "7.5" }, tool);
        expect(r.cvss).toBe(7.5);
    });

    test("boolean coercion", () => {
        const tool = { inputSchema: { properties: { verbose: { type: "boolean" } } } };
        const r = coerceArgs({ verbose: "true" }, tool);
        expect(r.verbose).toBe(true);
    });

    test("string passthrough", () => {
        const tool = { inputSchema: { properties: { target: { type: "string" } } } };
        const r = coerceArgs({ target: "127.0.0.1" }, tool);
        expect(r.target).toBe("127.0.0.1");
    });

    test("NaN fallback stays as string", () => {
        const tool = { inputSchema: { properties: { cvss: { type: "number" } } } };
        const r = coerceArgs({ cvss: "abc" }, tool);
        expect(r.cvss).toBe("abc");
        expect(typeof r.cvss).toBe("string");
    });

    test("array type [integer, null] coerces number", () => {
        const tool = { inputSchema: { properties: { timeout: { type: ["integer", "null"] } } } };
        const r = coerceArgs({ timeout: "30" }, tool);
        expect(r.timeout).toBe(30);
    });

    test("unknown key passes through as string", () => {
        const tool = { inputSchema: { properties: {} } };
        const r = coerceArgs({ unknown_key: "hello" }, tool);
        expect(r.unknown_key).toBe("hello");
    });

    test("empty value on a numeric field stays a string, not 0", () => {
        const tool = { inputSchema: { properties: { port: { type: "integer" } } } };
        const r = coerceArgs({ port: "" }, tool);
        expect(r.port).toBe("");   // a stray `port=` must not silently become 0
    });
});

// -- Test 1c: parseArgs() - key=value edge cases --

describe("Phase 1c: parseArgs()", () => {
    test("basic key=value", () => {
        expect(parseArgs(["title=hello"])).toEqual({ title: "hello" });
    });

    test("value containing = signs", () => {
        expect(parseArgs(["data=abc=def=ghi"])).toEqual({ data: "abc=def=ghi" });
    });

    test("no = sign is silently skipped", () => {
        expect(parseArgs(["noequals"])).toEqual({});
    });

    test("empty value", () => {
        expect(parseArgs(["key="])).toEqual({ key: "" });
    });

    test("empty array returns empty object", () => {
        expect(parseArgs([])).toEqual({});
    });
});

// -- Test 1d: recon parseOpenPorts() + selectWebPorts() --

describe("Phase 1d: recon parsing", () => {
    const NMAP = [
        "PORT       STATE    SERVICE    VERSION",
        "22/tcp     open     ssh        OpenSSH 8.9",
        "80/tcp     open     http       nginx 1.18",
        "443/tcp    open     https",
        "3306/tcp   closed   mysql",
        "8080/tcp   open     http-proxy",
    ].join("\n");

    test("parseOpenPorts extracts open ports + services, skips closed/headers", () => {
        expect(parseOpenPorts(NMAP)).toEqual([
            { port: 22,   service: "ssh" },
            { port: 80,   service: "http" },
            { port: 443,  service: "https" },
            { port: 8080, service: "http-proxy" },
        ]);
    });

    test("parseOpenPorts returns [] for empty / no-open output", () => {
        expect(parseOpenPorts("")).toEqual([]);
        expect(parseOpenPorts("Nmap done. 0 hosts up.")).toEqual([]);
    });

    test("selectWebPorts keeps http services + common web ports, drops ssh", () => {
        const web = selectWebPorts(parseOpenPorts(NMAP)).map(p => p.port);
        expect(web).toContain(80);
        expect(web).toContain(443);
        expect(web).toContain(8080);
        expect(web).not.toContain(22);
    });
});
