#!/usr/bin/env node
/**
 * Audit gate: `npm audit` for production deps, with a waiver mechanism.
 *
 * Replaces the bare `npm audit --omit=dev --audit-level=high` CI step. A bare
 * audit couples every PR merge to npm's advisory publication schedule: one
 * upstream advisory with no lockfile-only fix turns the required check red
 * repo-wide until someone lands a dependency change (this froze all merges
 * for weeks before 2026-08-02; see PR #242).
 *
 * Triaged advisories get a dated waiver in audit-exceptions.json:
 *
 *   { "exceptions": [ { "advisory": "GHSA-xxxx-yyyy-zzzz",
 *                       "package": "react-router",
 *                       "expires": "2026-09-30",
 *                       "reason": "why this does not affect the app" } ] }
 *
 * The gate fails on any high/critical production advisory that is unwaived
 * OR whose waiver has expired. Waivers must carry a reason and an expiry —
 * an expiry forces periodic re-triage instead of permanent exceptions.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const GATED_SEVERITIES = new Set(["high", "critical"]);
const GHSA_RE = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/;

/**
 * Extract gated advisories from an `npm audit --json` report.
 * Returns [{ id, package, severity, title, url }], deduplicated by GHSA id.
 */
export function collectAdvisories(auditReport) {
  const byId = new Map();
  for (const vuln of Object.values(auditReport.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      // String entries name a vulnerable dependency, not an advisory.
      if (typeof via !== "object" || via === null) continue;
      if (!GATED_SEVERITIES.has(via.severity)) continue;
      const id = GHSA_RE.exec(via.url ?? "")?.[0];
      if (!id || byId.has(id)) continue;
      byId.set(id, {
        id,
        package: via.name,
        severity: via.severity,
        title: via.title ?? "",
        url: via.url ?? "",
      });
    }
  }
  return [...byId.values()];
}

/**
 * Split advisories into blocking / waived / expired against the exception
 * list. A waiver is valid through the end of its `expires` day (inclusive).
 */
export function evaluateAudit(auditReport, exceptions, today) {
  const todayStr = today.toISOString().slice(0, 10);
  const blocking = [];
  const waived = [];
  const expired = [];
  for (const advisory of collectAdvisories(auditReport)) {
    const waiver = exceptions.find((e) => e.advisory === advisory.id);
    if (!waiver) {
      blocking.push(advisory);
    } else if (waiver.expires < todayStr) {
      expired.push({ ...advisory, waiver });
    } else {
      waived.push({ ...advisory, waiver });
    }
  }
  return { ok: blocking.length === 0 && expired.length === 0, blocking, waived, expired };
}

function runCli() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  // --audit-level only affects npm's exit code, not its JSON output, and the
  // exit code can't distinguish "advisories exist" from "npm broke" — so
  // always parse the JSON and decide ourselves.
  let raw;
  try {
    raw = execFileSync("npm", ["audit", "--omit=dev", "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    if (!err.stdout) throw err; // npm itself failed, not the audit
    raw = err.stdout;
  }
  const report = JSON.parse(raw);

  let exceptions = [];
  try {
    exceptions = JSON.parse(
      readFileSync(path.join(repoRoot, "audit-exceptions.json"), "utf8"),
    ).exceptions;
  } catch {
    // No exceptions file → no waivers; every gated advisory blocks.
  }

  const result = evaluateAudit(report, exceptions, new Date());

  for (const w of result.waived) {
    console.log(
      `WAIVED   ${w.id} (${w.package}, ${w.severity}) until ${w.waiver.expires}: ${w.waiver.reason}`,
    );
  }
  for (const e of result.expired) {
    console.error(
      `EXPIRED  ${e.id} (${e.package}, ${e.severity}) — waiver lapsed ${e.waiver.expires}; re-triage or fix. ${e.url}`,
    );
  }
  for (const b of result.blocking) {
    console.error(
      `BLOCKING ${b.id} (${b.package}, ${b.severity}) ${b.title} ${b.url}`,
    );
  }

  if (!result.ok) {
    console.error(
      "\nAudit gate failed. Fix the dependency, or add a dated waiver with a " +
        "reason to audit-exceptions.json (see scripts/audit-gate.mjs).",
    );
    process.exit(1);
  }
  console.log("Audit gate passed.");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runCli();
}
