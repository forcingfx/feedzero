/**
 * Per-request opaque identifier for tracing.
 *
 * Pattern: users hit an error → server returns `traceId` in the response
 * body → user shares the traceId in their support report → we grep
 * Vercel runtime logs for that exact id and find the failing request.
 *
 * Anonymity contract:
 *  - Each call produces a fresh value. No correlation across requests.
 *  - Format is opaque (random hex). Carries no user data, no timestamp,
 *    no environment info — just enough entropy to be searchable.
 *  - The 8-hex-char tail = 4 billion possibilities. Collision probability
 *    across a year of traffic is effectively zero at our scale, and even
 *    a collision is harmless (worst case: two requests share an id, one
 *    grep returns two results).
 *
 * Why "req_" prefix: makes the id immediately recognizable in any context
 * (response body, log line, support ticket) without needing to know the
 * shape. Grep-friendly.
 */
export function newTraceId(): string {
  return "req_" + crypto.randomUUID().split("-")[0];
}
