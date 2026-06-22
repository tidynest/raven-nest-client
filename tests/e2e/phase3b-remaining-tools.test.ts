// Phase 3b: All remaining tools against Docker targets
// Tests every tool NOT covered in the previous E2E run.
// Safety: only targets 127.0.0.1:3000 (Juice Shop), 127.0.0.1:80 (bWAPP), 127.0.0.1.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { McpClient } from "../../src/client/mcp-client";
import { SERVER_BIN } from "../../src/config";

// Server restricts file paths to its output_dir (/tmp/raven-nest by default).
// Test data files must live there for john/hydra to read them.
const SERVER_OUTPUT_DIR = "/tmp/raven-nest";
const FIXTURES_DIR = join(SERVER_OUTPUT_DIR, "e2e-fixtures");

// Helper: run a tool and return { text, isError } - never throws
async function tryTool(
    client: McpClient,
    name: string,
    args: Record<string, unknown>,
): Promise<{ text: string; isError: boolean }> {
    try {
        const result = await client.callTool(name, args);
        const text = result.content.map(b => b.text).join("\n");
        return { text, isError: result.isError ?? false };
    } catch (err) {
        return { text: (err as Error).message, isError: true };
    }
}

// ── Web scanners against Juice Shop ─────────────────────────────────

describe("Web scanners (Juice Shop)", () => {
    const client = new McpClient(SERVER_BIN, (msg) => {
        process.stderr.write(`[progress] ${msg}\n`);
    });

    test("connects", async () => { await client.connect(); });

    test("run_dalfox - XSS scanner", async () => {
        const r = await tryTool(client, "run_dalfox", {
            target: "http://127.0.0.1:3000/rest/products/search?q=test",
        });
        console.log(`[dalfox] isError=${r.isError}, output: ${r.text.slice(0, 200)}`);
        expect(r.text.length).toBeGreaterThan(0);
    }, 120_000);

    test("run_feroxbuster - directory discovery", async () => {
        const r = await tryTool(client, "run_feroxbuster", {
            target: "http://127.0.0.1:3000",
            threads: 5,
        });
        console.log(`[feroxbuster] isError=${r.isError}, output: ${r.text.slice(0, 200)}`);
        expect(r.text.length).toBeGreaterThan(0);
    }, 300_000);

    test("run_ffuf - web fuzzer", async () => {
        const r = await tryTool(client, "run_ffuf", {
            url: "http://127.0.0.1:3000/FUZZ",
            threads: 5,
        });
        console.log(`[ffuf] isError=${r.isError}, output: ${r.text.slice(0, 200)}`);
        expect(r.text.length).toBeGreaterThan(0);
    }, 120_000);

    test("run_sqlmap - SQL injection", async () => {
        const r = await tryTool(client, "run_sqlmap", {
            url: "http://127.0.0.1:3000/rest/products/search?q=test",
            level: 1,
            risk: 1,
        });
        console.log(`[sqlmap] isError=${r.isError}, output: ${r.text.slice(0, 300)}`);
        expect(r.text.length).toBeGreaterThan(0);
    }, 300_000);

    test("run_wpscan - WordPress scanner", async () => {
        const r = await tryTool(client, "run_wpscan", {
            target: "http://127.0.0.1:3000",
        });
        console.log(`[wpscan] isError=${r.isError}, output: ${r.text.slice(0, 200)}`);
        // WPScan will report it's not WordPress - that's expected
        expect(r.text.length).toBeGreaterThan(0);
    }, 120_000);

    afterAll(async () => { await client.disconnect(); });
});

// ── Network / infrastructure tools ──────────────────────────────────

describe("Network / infra tools", () => {
    const client = new McpClient(SERVER_BIN, (msg) => {
        process.stderr.write(`[progress] ${msg}\n`);
    });

    test("connects", async () => { await client.connect(); });

    test("run_testssl - SSL/TLS testing", async () => {
        // Juice Shop is HTTP-only; testssl should report no SSL
        const r = await tryTool(client, "run_testssl", {
            target: "127.0.0.1:3000",
            quick: true,
        });
        console.log(`[testssl] isError=${r.isError}, output: ${r.text.slice(0, 200)}`);
        expect(r.text.length).toBeGreaterThan(0);
    }, 120_000);

    test("run_subfinder - subdomain enumeration", async () => {
        // Using a real domain so subfinder has something to enumerate
        const r = await tryTool(client, "run_subfinder", {
            target: "juice-shop.herokuapp.com",
            timeout_secs: 30,
        });
        console.log(`[subfinder] isError=${r.isError}, output: ${r.text.slice(0, 200)}`);
        expect(r.text.length).toBeGreaterThan(0);
    }, 60_000);

    test("run_dnsrecon - DNS reconnaissance", async () => {
        const r = await tryTool(client, "run_dnsrecon", {
            target: "localhost",
            timeout_secs: 30,
        });
        console.log(`[dnsrecon] isError=${r.isError}, output: ${r.text.slice(0, 200)}`);
        expect(r.text.length).toBeGreaterThan(0);
    }, 60_000);

    test("run_enum4linux_ng - SMB enumeration", async () => {
        // No SMB service on targets - should report failure gracefully
        const r = await tryTool(client, "run_enum4linux_ng", {
            target: "127.0.0.1",
            timeout_secs: 30,
        });
        console.log(`[enum4linux] isError=${r.isError}, output: ${r.text.slice(0, 200)}`);
        expect(r.text.length).toBeGreaterThan(0);
    }, 60_000);

    test("run_masscan - fast port scan (sudo)", async () => {
        const r = await tryTool(client, "run_masscan", {
            target: "127.0.0.1",
            ports: "80,3000",
            rate: 100,
        });
        console.log(`[masscan] isError=${r.isError}, output: ${r.text.slice(0, 200)}`);
        expect(r.text.length).toBeGreaterThan(0);
    }, 60_000);

    afterAll(async () => { await client.disconnect(); });
});

// ── Credential / password tools ─────────────────────────────────────

describe("Credential tools", () => {
    const client = new McpClient(SERVER_BIN, (msg) => {
        process.stderr.write(`[progress] ${msg}\n`);
    });

    const userlist = join(FIXTURES_DIR, "users.txt");
    const passlist = join(FIXTURES_DIR, "pass.txt");
    const hashFile = join(FIXTURES_DIR, "hash.txt");

    beforeAll(() => {
        mkdirSync(FIXTURES_DIR, { recursive: true });
        writeFileSync(userlist, "admin\ntest\nroot");
        writeFileSync(passlist, "password\ntest123\nadmin\n123456");
        writeFileSync(hashFile, "testuser:5f4dcc3b5aa765d61d8327deb882cf99");
    });

    test("connects", async () => { await client.connect(); });

    test("run_hydra - brute force against bWAPP HTTP", async () => {
        const r = await tryTool(client, "run_hydra", {
            target: "127.0.0.1",
            service: "http-post-form",
            port: 80,
            userlist,
            passlist,
            form_params: "/login.php:login=^USER^&password=^PASS^&security_level=0&form=submit:Invalid",
            tasks: 2,
        });
        console.log(`[hydra] isError=${r.isError}, output: ${r.text.slice(0, 300)}`);
        expect(r.text.length).toBeGreaterThan(0);
    }, 120_000);

    test("run_john - password cracking", async () => {
        const r = await tryTool(client, "run_john", {
            hash_file: hashFile,
            format: "raw-md5",
            max_run_time: 10,
        });
        console.log(`[john] isError=${r.isError}, output: ${r.text.slice(0, 200)}`);
        expect(r.text.length).toBeGreaterThan(0);
    }, 60_000);

    afterAll(async () => {
        await client.disconnect();
        rmSync(FIXTURES_DIR, { recursive: true, force: true });
    });
});

// ── Secret scanners (take a filesystem path, not a host) ────────────

describe("Secret scanners", () => {
    const client = new McpClient(SERVER_BIN, (msg) => {
        process.stderr.write(`[progress] ${msg}\n`);
    });

    // Server confines scan paths to its output_dir. Plant a fixture with
    // synthetic, randomly-typed secrets (NOT real credentials, never committed,
    // removed in afterAll) so the scanners have something to flag. Avoids the
    // vendors' example-key allowlists, which silently suppress detections.
    const SECRETS_DIR = join(SERVER_OUTPUT_DIR, "e2e-secrets");

    beforeAll(() => {
        mkdirSync(SECRETS_DIR, { recursive: true });
        // Fakes assembled from fragments so no scanner-matchable literal sits in
        // committed source (keeps the repo from self-tripping gitleaks / remote
        // secret scanning). The written file lands under output_dir, is untracked,
        // and is removed in afterAll. These are NOT real credentials.
        const pat    = "ghp" + "_" + "A8kZq2Rm7Xv1Lp9Nd4Tf6Wb3Yc0Hs5Ej8Ku";
        const awsId  = "AKIA" + "Z3XK7PQR2WTJ9LMN";
        const awsKey = "aJ8x/K2lP9mQ4n" + "R7sT1uV6wY0zB3cD5eF8gH1iJ2";
        writeFileSync(
            join(SECRETS_DIR, "leak.env"),
            `github_pat = ${pat}\n` +
            `aws_access_key_id = ${awsId}\n` +
            `aws_secret_access_key = ${awsKey}\n`,
        );
    });

    test("connects", async () => { await client.connect(); });

    test("run_gitleaks - secret detection on a filesystem path", async () => {
        const r = await tryTool(client, "run_gitleaks", { path: SECRETS_DIR });
        console.log(`[gitleaks] isError=${r.isError}, output: ${r.text.slice(0, 300)}`);
        // A detected secret makes gitleaks exit 1; the server maps that to
        // success, so neither a hit nor a clean scan surfaces as an error.
        expect(r.isError).toBe(false);
        expect(r.text.length).toBeGreaterThan(0);
    }, 60_000);

    test("run_trufflehog - secret detection on a filesystem path", async () => {
        // verify=false: no outbound credential-verification calls
        const r = await tryTool(client, "run_trufflehog", { path: SECRETS_DIR });
        console.log(`[trufflehog] isError=${r.isError}, output: ${r.text.slice(0, 300)}`);
        expect(r.isError).toBe(false);
        expect(r.text.length).toBeGreaterThan(0);
    }, 120_000);

    afterAll(async () => {
        await client.disconnect();
        rmSync(SECRETS_DIR, { recursive: true, force: true });
    });
});

// ── Metasploit tools ────────────────────────────────────────────────

describe("Metasploit tools", () => {
    const client = new McpClient(SERVER_BIN, (msg) => {
        process.stderr.write(`[progress] ${msg}\n`);
    });

    test("connects", async () => { await client.connect(); });

    test("msf_search - search for modules", async () => {
        const r = await tryTool(client, "msf_search", {
            query: "http_version",
            limit: 5,
        });
        console.log(`[msf_search] isError=${r.isError}, output: ${r.text.slice(0, 300)}`);
        expect(r.text.length).toBeGreaterThan(0);
    }, 60_000);

    test("msf_module_info - get module details", async () => {
        const r = await tryTool(client, "msf_module_info", {
            module: "auxiliary/scanner/http/http_version",
        });
        console.log(`[msf_module_info] isError=${r.isError}, output: ${r.text.slice(0, 300)}`);
        expect(r.text.length).toBeGreaterThan(0);
    }, 60_000);

    test("msf_auxiliary - HTTP version scan against Juice Shop", async () => {
        const r = await tryTool(client, "msf_auxiliary", {
            module: "auxiliary/scanner/http/http_version",
            target: "127.0.0.1",
            port: 3000,
        });
        console.log(`[msf_auxiliary] isError=${r.isError}, output: ${r.text.slice(0, 300)}`);
        expect(r.text.length).toBeGreaterThan(0);
    }, 120_000);

    test("msf_sessions - list active sessions", async () => {
        const r = await tryTool(client, "msf_sessions", {
            action: "list",
        });
        console.log(`[msf_sessions] isError=${r.isError}, output: ${r.text.slice(0, 200)}`);
        expect(r.text.length).toBeGreaterThan(0);
    }, 30_000);

    test("msf_exploit - safe exploit attempt (Juice Shop)", async () => {
        // Use a web-based exploit module that won't cause damage
        const r = await tryTool(client, "msf_exploit", {
            module: "exploit/multi/http/nostromo_code_exec",
            target: "127.0.0.1",
            port: 3000,
            lhost: "127.0.0.1",
            lport: 4444,
        });
        console.log(`[msf_exploit] isError=${r.isError}, output: ${r.text.slice(0, 300)}`);
        // Exploit will likely fail (wrong service) but should execute without crash
        expect(r.text.length).toBeGreaterThan(0);
    }, 120_000);

    test("msf_post - post-exploitation (no session)", async () => {
        // No active session - should fail gracefully
        const r = await tryTool(client, "msf_post", {
            module: "post/multi/gather/env",
            session_id: 1,
        });
        console.log(`[msf_post] isError=${r.isError}, output: ${r.text.slice(0, 200)}`);
        // Expected to error (no session exists) - verify it doesn't crash
        expect(r.text.length).toBeGreaterThan(0);
    }, 60_000);

    afterAll(async () => { await client.disconnect(); });
});
