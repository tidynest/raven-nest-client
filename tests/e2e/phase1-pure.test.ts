// Phase 1: Pure function tests - no server needed
// Validates tokenize(), coerceArgs(), and parseArgs() with zero external dependencies.
// tokenize and coerceArgs are inlined because index.ts auto-runs main() on import.

import { describe, test, expect } from "bun:test";
import { parseArgs } from "../../src/commands/finding";

// -- Inlined from index.ts:34-59 (can't import without triggering main()) --

function tokenize(line: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let quote = "";
    for (const ch of line) {
        if (quote) {
            if (ch === quote) { quote = ""; } else { current += ch; }
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === " ") {
            if (current) { tokens.push(current); current = ""; }
        } else {
            current += ch;
        }
    }
    if (current) tokens.push(current);
    return tokens;
}

// -- Inlined from index.ts:65-93 --

interface ToolDef {
    inputSchema: { properties?: Record<string, unknown> };
}

function coerceArgs(raw: Record<string, string>, tool: ToolDef): Record<string, unknown> {
    const props = tool.inputSchema.properties ?? {};
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
        const schema = props[key] as Record<string, unknown> | undefined;
        if (!schema) { result[key] = value; continue; }
        const typeVal = schema.type;
        const types: string[] = Array.isArray(typeVal)
            ? typeVal
            : String(typeVal ?? "string").split(",").map(t => t.trim());
        if (types.includes("number") || types.includes("integer")) {
            const num = Number(value);
            result[key] = isNaN(num) ? value : num;
        } else if (types.includes("boolean")) {
            result[key] = value === "true";
        } else {
            result[key] = value;
        }
    }
    return result;
}

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
});

// -- Test 1b: coerceArgs() - type coercion and NaN handling --

describe("Phase 1b: coerceArgs()", () => {
    test("integer coercion", () => {
        const tool: ToolDef = { inputSchema: { properties: { count: { type: "integer" } } } };
        const r = coerceArgs({ count: "5" }, tool);
        expect(r.count).toBe(5);
        expect(typeof r.count).toBe("number");
    });

    test("float coercion", () => {
        const tool: ToolDef = { inputSchema: { properties: { cvss: { type: "number" } } } };
        const r = coerceArgs({ cvss: "7.5" }, tool);
        expect(r.cvss).toBe(7.5);
    });

    test("boolean coercion", () => {
        const tool: ToolDef = { inputSchema: { properties: { verbose: { type: "boolean" } } } };
        const r = coerceArgs({ verbose: "true" }, tool);
        expect(r.verbose).toBe(true);
    });

    test("string passthrough", () => {
        const tool: ToolDef = { inputSchema: { properties: { target: { type: "string" } } } };
        const r = coerceArgs({ target: "127.0.0.1" }, tool);
        expect(r.target).toBe("127.0.0.1");
    });

    test("NaN fallback stays as string", () => {
        const tool: ToolDef = { inputSchema: { properties: { cvss: { type: "number" } } } };
        const r = coerceArgs({ cvss: "abc" }, tool);
        expect(r.cvss).toBe("abc");
        expect(typeof r.cvss).toBe("string");
    });

    test("array type [integer, null] coerces number", () => {
        const tool: ToolDef = { inputSchema: { properties: { timeout: { type: ["integer", "null"] } } } };
        const r = coerceArgs({ timeout: "30" }, tool);
        expect(r.timeout).toBe(30);
    });

    test("unknown key passes through as string", () => {
        const tool: ToolDef = { inputSchema: { properties: {} } };
        const r = coerceArgs({ unknown_key: "hello" }, tool);
        expect(r.unknown_key).toBe("hello");
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
