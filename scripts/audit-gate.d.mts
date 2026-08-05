/** Type surface for scripts/audit-gate.mjs (consumed by its vitest suite). */

export interface Advisory {
  id: string;
  package: string;
  severity: string;
  title: string;
  url: string;
}

export interface AuditException {
  advisory: string;
  package: string;
  /** YYYY-MM-DD; the waiver is valid through the end of this day. */
  expires: string;
  reason: string;
}

export interface AuditVerdict {
  ok: boolean;
  blocking: Advisory[];
  waived: Array<Advisory & { waiver: AuditException }>;
  expired: Array<Advisory & { waiver: AuditException }>;
}

export function collectAdvisories(auditReport: unknown): Advisory[];
export function evaluateAudit(
  auditReport: unknown,
  exceptions: AuditException[],
  today: Date,
): AuditVerdict;
