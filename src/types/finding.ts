// src/types/finding.ts
// Finding types - mirrors the server's SaveFindingRequest. A finding is a
// discovered vulnerability the server persists and can later compile into a
// report. The server owns the persisted shape (id, timestamp, formatting);
// this client only ever builds the save request and reads back server text.

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
