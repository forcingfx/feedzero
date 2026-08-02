import { describe, it, expect } from "vitest";
import {
  collectAdvisories,
  evaluateAudit,
} from "../../scripts/audit-gate.mjs";

/** Minimal slice of `npm audit --json` output covering one advisory. */
function auditReport(
  vulns: Record<
    string,
    { severity: string; via: Array<Record<string, unknown> | string> }
  >,
) {
  return { vulnerabilities: vulns };
}

const RR_ADVISORY = {
  source: 1105443,
  name: "react-router",
  title: "React Router: RSC Mode CSRF Bypass",
  url: "https://github.com/advisories/GHSA-qwww-vcr4-c8h2",
  severity: "high",
};

describe("collectAdvisories", () => {
  it("extracts GHSA ids from via objects, deduplicated", () => {
    const report = auditReport({
      "react-router": { severity: "high", via: [RR_ADVISORY] },
      // A package flagged only transitively lists the parent name as a
      // string in `via` — no advisory of its own to collect.
      "some-wrapper": { severity: "high", via: ["react-router"] },
    });

    const advisories = collectAdvisories(report);

    expect(advisories).toHaveLength(1);
    expect(advisories[0]).toMatchObject({
      id: "GHSA-qwww-vcr4-c8h2",
      package: "react-router",
      severity: "high",
    });
  });

  it("ignores advisories below high severity", () => {
    const report = auditReport({
      lodash: {
        severity: "moderate",
        via: [
          {
            name: "lodash",
            title: "moderate thing",
            url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
            severity: "moderate",
          },
        ],
      },
    });

    expect(collectAdvisories(report)).toHaveLength(0);
  });
});

describe("evaluateAudit", () => {
  const report = auditReport({
    "react-router": { severity: "high", via: [RR_ADVISORY] },
  });

  it("blocks unwaived advisories", () => {
    const result = evaluateAudit(report, [], new Date("2026-08-02"));
    expect(result.blocking).toHaveLength(1);
    expect(result.blocking[0].id).toBe("GHSA-qwww-vcr4-c8h2");
    expect(result.ok).toBe(false);
  });

  it("passes advisories with an unexpired waiver, reporting them", () => {
    const result = evaluateAudit(
      report,
      [
        {
          advisory: "GHSA-qwww-vcr4-c8h2",
          package: "react-router",
          expires: "2026-12-31",
          reason: "RSC-mode-only; app is client-only BrowserRouter.",
        },
      ],
      new Date("2026-08-02"),
    );
    expect(result.ok).toBe(true);
    expect(result.waived).toHaveLength(1);
    expect(result.blocking).toHaveLength(0);
  });

  it("blocks advisories whose waiver has expired", () => {
    const result = evaluateAudit(
      report,
      [
        {
          advisory: "GHSA-qwww-vcr4-c8h2",
          package: "react-router",
          expires: "2026-07-01",
          reason: "expired waiver",
        },
      ],
      new Date("2026-08-02"),
    );
    expect(result.ok).toBe(false);
    expect(result.expired).toHaveLength(1);
    expect(result.blocking).toHaveLength(0);
  });

  it("passes a clean report", () => {
    const result = evaluateAudit(auditReport({}), [], new Date("2026-08-02"));
    expect(result.ok).toBe(true);
    expect(result.blocking).toHaveLength(0);
    expect(result.waived).toHaveLength(0);
  });

  it("a waiver expiring today still passes (expiry is end-of-day inclusive)", () => {
    const result = evaluateAudit(
      report,
      [
        {
          advisory: "GHSA-qwww-vcr4-c8h2",
          package: "react-router",
          expires: "2026-08-02",
          reason: "expires today",
        },
      ],
      new Date("2026-08-02T12:00:00Z"),
    );
    expect(result.ok).toBe(true);
  });
});
