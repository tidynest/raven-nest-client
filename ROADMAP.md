# Roadmap

Ideas for both `raven-nest-client` (TypeScript/Bun) and `raven-nest-mcp` (Rust server).
Ordered by impact within each section. Unchecked = not started.

---

## Server (raven-nest-mcp)

### High Priority

- [ ] **Auto-finding extraction from scan output**
  The parsers already understand tool output structure (nuclei severity tags, nikto warnings, nmap service banners). Extend them to optionally emit structured findings alongside text output. Needs a confidence threshold or review step to avoid noise flooding the report.
  *Affected crates:* `raven-core` (parsers), `raven-report` (finding store)

- [ ] **Target scope management**
  A `[scope]` config section with allowed CIDRs, domains, and URLs. `validate_target()` already exists — gate it against the scope allowlist before every tool invocation. Critical for professional engagements where out-of-scope scanning has legal consequences.
  *Affected crates:* `raven-core` (config, validation)

- [ ] **Scan-to-finding linking**
  Add optional `scan_id: Option<Uuid>` to `SaveFindingRequest`. Link findings to the scan that produced them. Enables "show all findings from scan X" and better report traceability.
  *Affected crates:* `raven-report` (finding model, store)

- [ ] **Engagement / project management**
  Named engagements with scope, timeline, client info, and notes. Each engagement gets its own output directory, findings store, and report context. Enables `create_engagement`, `switch_engagement`, `list_engagements`. Findings and scans belong to the active engagement.
  *Affected crates:* `raven-core` (new engagement manager), `raven-report` (scoped store)

### Medium Priority

- [ ] **Additional report formats (SARIF, JSON, HTML)**
  SARIF for GitHub Security / Defect Dojo / CI pipelines. JSON for programmatic consumption. HTML for standalone shareable reports. The finding data model is already structured enough — mostly serialisation work.
  *Affected crates:* `raven-report`

- [ ] **Finding deduplication**
  Detect when a finding with the same title + target + tool already exists. Warn or merge instead of creating duplicates. Keeps reports clean during iterative scanning.
  *Affected crates:* `raven-report` (store)

- [ ] **Target discovery tracking**
  Persist discovered hosts, ports, services, and technologies across scans. When nmap finds port 80 open and whatweb identifies Apache, store that as structured target metadata. Enables "what do we know about 192.168.1.100?" queries.
  *New crate or extend:* `raven-core`

- [ ] **Scan diffing**
  Compare two scans of the same target to find what changed (new ports, removed services, new vulns). Useful for re-testing after remediation or monitoring over time.
  *Affected crates:* `raven-core` (scan manager)

- [ ] **Background scan persistence**
  Scans are lost on server restart. Serialize running scan state to disk so they can be recovered (or at least their partial output preserved).
  *Affected crates:* `raven-core` (scan manager)

### Lower Priority

- [ ] **Custom tool registration via config**
  Allow adding new tools without recompiling: `[tools.custom_tool]` with command template, timeout, parser hint. Useful for project-specific scripts or tools not yet built in.
  *Affected crates:* `raven-core` (config, tool dispatch)

- [ ] **Webhook notifications**
  Fire a webhook (or write to a file) when a critical/high finding is saved. Integrates with Slack, Discord, or custom alerting.
  *Affected crates:* `raven-report`

- [ ] **Evidence attachment**
  Link raw HTTP responses, screenshots, or files to findings as evidence. Store in `{output_dir}/evidence/{finding_id}/`. Reference from finding JSON.
  *Affected crates:* `raven-report`

- [ ] **Vulnerability database integration**
  CVE lookup and CVSS auto-calculation. When a finding includes a CVE ID, fetch details from NVD or a local mirror. Pre-populate description, CVSS, and remediation.
  *Affected crates:* `raven-core` or new crate

- [ ] **Finding templates**
  Pre-built finding descriptions for common vulnerabilities (directory listing, missing headers, default credentials). Operator selects a template and fills in target-specific details instead of writing from scratch.
  *Affected crates:* `raven-report`

- [ ] **Export to vulnerability management platforms**
  Push findings to Defect Dojo, Jira, GitHub Issues, or GitLab Issues via their APIs. Enables integration into existing remediation workflows.
  *Affected crates:* new crate or `raven-report`

- [ ] **Rate limiting per target**
  Cap requests/second to individual targets to avoid triggering WAFs or crashing fragile services. Currently only masscan has a rate limit. Extend to HTTP-based tools.
  *Affected crates:* `raven-core`

---

## Client (raven-nest-client)

### High Priority

- [ ] **Scan orchestration / recon workflows**
  A `recon <target>` command that chains: nmap (discover ports) -> whatweb (identify tech on HTTP ports) -> nikto (scan web servers) -> nuclei (check known CVEs). Intelligent filtering between stages (only scan what the previous step discovered). Teaches state machines, dependency graphs, and async orchestration.
  *New files:* `src/workflows/`, `src/commands/recon.ts`

- [ ] **Web dashboard with Bun.serve()**
  Real-time browser dashboard using Bun's built-in HTTP server + WebSocket. Shows: running scans with live progress, findings summary (severity breakdown chart), scan history timeline, target map. Uses HTML imports (no vite/webpack). Teaches frontend dev, WebSocket, reactive UI.
  *New files:* `src/dashboard/`, `public/`

- [ ] **Multi-target batch mode**
  `--targets targets.txt` reads hosts/URLs from a file and iterates. Aggregate results across all targets. Covers real-world pentesting where you scan a /24 or a domain list. Teaches `Bun.file()` and async iteration.
  *Affected files:* `index.ts`, new `src/targets.ts`

- [ ] **Target tracking / history**
  Track which targets have been scanned, with which tools, when, and what was found. `targets` command lists all known targets with a summary. `target 192.168.1.100` shows everything known about that host. Persisted locally so it survives across sessions.
  *New files:* `src/targets.ts`, local storage

### Medium Priority

- [ ] **Local session persistence with bun:sqlite**
  Cache the current engagement's state locally: which tools ran, against which targets, what findings exist. Enables `session save pentest-q1` / `session load pentest-q1`. Zero external deps (bun:sqlite is built in). Teaches SQLite, migrations, data modelling.
  *New files:* `src/db.ts`, `src/commands/session.ts`

- [ ] **Credential manager**
  Store credentials discovered during scanning (hydra hits, default creds found by nikto). Reuse for authenticated scanning in later phases. `creds list`, `creds add`, `creds use <id>` to set cookies/auth for subsequent tools.
  *New files:* `src/commands/creds.ts`

- [ ] **Interactive report builder**
  Customise report before generation: select/exclude findings, reorder sections, edit executive summary, choose format. `report build` opens an interactive flow. More control than the current `report [title=...]`.
  *New files:* `src/commands/report.ts` (extended)

- [ ] **Parallel scan execution from REPL**
  Currently the REPL blocks on each tool call. Allow `&` suffix to run in background: `call run_nmap target=192.168.1.0/24 &`. Show a job list with `jobs`. Teaches async concurrency patterns.
  *Affected files:* `index.ts` (REPL loop)

### Lower Priority

- [ ] **Shell completion installer**
  `bun run index.ts --completions bash > /etc/bash_completion.d/raven` generates shell completion scripts. Tab-complete tool names and flags outside the REPL.
  *New files:* `src/completions.ts`

- [ ] **Plugin / extension system**
  Custom commands loadable from `~/.raven/plugins/`. Each plugin exports a name, description, and handler function. Enables project-specific workflows without forking the client.
  *New files:* `src/plugins.ts`

- [ ] **Compliance mapping**
  Map findings to compliance frameworks (PCI-DSS, OWASP Top 10, NIST, HIPAA). `finding save ... compliance=pci-dss:6.5.1`. Reports include a compliance summary section.
  *New files:* `src/types/compliance.ts`

- [ ] **Diff viewer**
  Compare scan results from two different dates for the same target. `diff <scan_id_1> <scan_id_2>` highlights new/removed ports, services, or vulnerabilities. Useful for re-testing after remediation.
  *New files:* `src/commands/diff.ts`

- [ ] **Colour theme configuration**
  User-configurable colour palette via config file or `--theme` flag. Current warm palette is hardcoded. Themes: dark, light, solarized, minimal (no colour).
  *Affected files:* `index.ts` (colour map)

---

## Cross-Project

- [ ] **Engagement sync between client and server**
  Client creates/switches engagements, server scopes its findings store accordingly. Requires protocol additions (new MCP methods).

- [ ] **Structured scan results**
  Server returns parsed results as JSON (not just text) alongside the human-readable output. Client can then filter, sort, and correlate without re-parsing text. Major protocol change.

- [ ] **CI/CD integration mode**
  `bun run index.ts ci --targets targets.txt --workflow recon --format sarif --fail-on critical` for pipeline use. Non-interactive, exits with code 1 if critical findings found. Combines multi-target, orchestration, and SARIF export.

---

## Future / Potential

Ideas that may become relevant as the projects mature.

- [ ] **Report customisation**
  Executive summary tone (technical vs. management), finding grouping (by target, severity, or OWASP category), section selection. Client-side templating before calling `generate_report`.

- [ ] **Scan scheduling**
  Run nuclei every night against the target list, alert on new findings. Client schedules via cron-like syntax, server executes and diffs against previous results.

- [ ] **Network graph visualisation**
  Map targets, ports, services, and findings as an interactive graph in the web dashboard. Nodes = hosts, edges = connections, colour = severity. Uses the target discovery data.

- [ ] **Finding severity override**
  Pentester disagrees with auto-extracted severity. `finding update <id> severity=high reason="exploitable without auth"`. Stores original and overridden severity with justification.

- [ ] **Remediation tracking**
  Mark findings as "remediated" with a timestamp. Re-test by re-running the original tool against the same target. Confirm fixed or reopen. Enables retest reports.

- [ ] **Team collaboration**
  Multiple operators sharing a findings store over the network. Conflict resolution for concurrent edits. Probably requires moving from file-per-finding to a shared database.

- [ ] **Engagement timeline**
  Visual timeline of all actions taken during an engagement: scans launched, findings saved, reports generated. Exportable for evidence of methodology in compliance audits.

- [ ] **Custom finding fields**
  Project-specific metadata on findings (e.g., `business_impact`, `affected_users`, `data_classification`). Configurable per engagement, included in reports.

- [ ] **Offline mode**
  Client works without the server for report editing, finding review, and session management. Syncs with the server when connection is restored.
