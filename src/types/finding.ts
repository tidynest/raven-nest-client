// src/types/finding.ts
// Finding types - mirrors raven-report's Finding struct and the server's
// SaveFindingRequest. Findings represent discovered vulnerabilities that
// the server persists and can later compile into a Markdown report.

/** Vulnerability severity levels - matches the server's Severity enum exactly.
 *  Ordering from most to least critical. */
export type Severity = "Critical" | "High" | "Medium" | "Low" | "Info";

/** Complete finding as persisted by the server. Returned by "get_finding".
 *  All fields except the optional ones are guaranteed present. */
export interface Finding {
    /** Server-assigned UUID for this finding */
    id:                 string;
    /** Short title summarising the vulnerability */
    title:              string;
    /** How severe the vulnerability is */
    severity:           Severity;
    /** Detailed explanation of the vulnerability */
    description:        string;
    /** Host, IP, or URL where the vulnerability was found */
    target:             string;
    /** Name of the security tool that discovered it */
    tool:               string;
    /** Raw evidence (e.g. HTTP response snippet, error message) */
    evidence?:          string;
    /** Suggested fix or mitigation steps */
    remediation?:       string;
    /** CVSS v3.x base score (0.0 to 10.0) */
    cvss?:              number;
    /** CVE identifier if one exists (e.g. "CVE-2024-1234") */
    cve?:               string;
    /** OWASP Top 10 category (e.g. "A03:2021 Injection") */
    owasp_category?:    string;
    /** ISO 8601 timestamp of when the finding was saved */
    timestamp:          string;
}

/** Parameters for the "save_finding" tool - matches the server's
 *  SaveFindingRequest. The server assigns `id` and `timestamp`
 *  automatically, so they are not included here. */
export interface SaveFindingParams {
    /** Short title summarising the vulnerability */
    title:              string;
    /** Severity level as a string (server normalises casing) */
    severity:           string;
    /** Detailed explanation of the vulnerability */
    description:        string;
    /** Host, IP, or URL where the vulnerability was found */
    target:             string;
    /** Name of the security tool that discovered it */
    tool:               string;
    /** Raw evidence (e.g. HTTP response snippet, error message) */
    evidence?:          string;
    /** Suggested fix or mitigation steps */
    remediation?:       string;
    /** CVSS v3.x base score (0.0 to 10.0) */
    cvss?:              number;
    /** CVE identifier if one exists */
    cve?:               string;
    /** OWASP Top 10 category */
    owasp_category?:    string;
}
