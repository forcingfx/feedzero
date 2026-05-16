/**
 * Structured error logger with an allow-list field schema.
 *
 * Privacy floor (enforced by both the TypeScript type AND a runtime
 * field-pick): error logs MUST NEVER include vaultId, customerId, email,
 * IP, User-Agent, license token contents, or any vault ciphertext.
 *
 * Why a tiny dedicated helper instead of `console.error(err)`:
 *  - The TypeScript interface IS the allow-list. A future caller can't
 *    accidentally include a PII field without a `@ts-expect-error`.
 *  - Defensive runtime drop: even if the type is bypassed (e.g. via `any`),
 *    only known fields are picked into the JSON payload. The test suite
 *    asserts this — see tests/core/utils/log-error.test.ts.
 *  - Output is single-line JSON so Vercel's runtime-log filter UI can
 *    parse + grep it cleanly.
 *
 * Pair with `newTraceId()` (src/utils/trace-id.ts) so each error log
 * carries an opaque request id that users can quote in support requests.
 */

export interface ErrorLogFields {
  /** Route path, e.g. "/api/sync". */
  route: string;
  /** HTTP method, e.g. "PUT". */
  method: string;
  /** Response status code we returned to the client. */
  status: number;
  /** Opaque per-request id. See `newTraceId`. */
  traceId: string;
  /**
   * Error class (e.g. "ENOENT", "InvalidSignature"). Free-form short
   * string — typically `e.constructor.name` or a custom label.
   */
  errClass: string;
  /**
   * Human-readable error message. Caller's responsibility to ensure no
   * PII leaks (e.g. don't include vaultId in the message). The logger
   * trusts the caller for this field but defensively drops everything
   * else.
   */
  errMsg: string;
}

const ALLOWED_FIELDS = [
  "route",
  "method",
  "status",
  "traceId",
  "errClass",
  "errMsg",
] as const satisfies readonly (keyof ErrorLogFields)[];

export function logError(fields: ErrorLogFields): void {
  // Defensive field pick. Even if caller bypasses TypeScript (via `any`
  // or untyped object), only allow-listed fields make it into the log.
  const safe: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    safe[key] = fields[key];
  }
  safe.ts = new Date().toISOString();
  console.error(JSON.stringify(safe));

  // Operator alert for silent webhook failures. When the Stripe webhook
  // returns 200 with errClass="AcceptedWithIssue", the customer never
  // hears about it but the license never issues. We can't have those
  // hide in the log noise. Best-effort POST to the operator's webhook
  // (Slack, Discord, etc.) so the next paying customer's incident
  // becomes a notification.
  //
  // Fire-and-forget. Failure to alert MUST NOT crash the request handler
  // that called us.
  if (fields.errClass === "AcceptedWithIssue") {
    const url = process.env.OPERATOR_ALERT_URL;
    if (url) {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safe),
      }).catch(() => {
        // swallow — alert failures don't propagate
      });
    }
  }
}
