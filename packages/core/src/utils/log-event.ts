/**
 * Structured event logger with an allow-list field schema, for routine
 * operational samples rather than failures.
 *
 * Why this exists separately from `logError`:
 *  - It writes to `console.log`, not `console.error`. A size sample on
 *    every successful push is not an ops event, and mixing the two
 *    inflates the error log that on-call actually reads.
 *  - The privacy floor is the same and is enforced the same way: the
 *    TypeScript interface IS the allow-list, plus a defensive runtime
 *    pick so a caller reaching for `any` still cannot leak a vaultId,
 *    an IP, an email or any ciphertext into the log.
 *
 * What it is for: seeing whether vault sizes are trending toward the
 * sync ceiling across the whole population, before the first user is
 * blocked. That question needs a distribution, not identities, which is
 * why sizes are logged as coarse buckets and nothing identifies the
 * request's owner. There is deliberately no way to follow one vault
 * over time through these lines.
 */

export interface EventLogFields {
  /** Route path, e.g. "/api/sync". */
  route: string;
  /** HTTP method, e.g. "PUT". */
  method: string;
  /** Short event name, e.g. "vault.put". */
  event: string;
  /** Coarse size class from {@link sizeBucket}. Never an exact size. */
  sizeBucket: string;
  /** Body encoding the client used: "gzip" or "identity". */
  encoding: string;
}

const ALLOWED_FIELDS = [
  "route",
  "method",
  "event",
  "sizeBucket",
  "encoding",
] as const satisfies readonly (keyof EventLogFields)[];

const BUCKET_CEILING_BYTES = 4 * 1024 * 1024;
const SMALLEST_BUCKET_BYTES = 64 * 1024;

/**
 * Coarse size class for a body, as a power-of-two bucket label.
 *
 * Matches how `padPayload` buckets a push, so the label lines up with
 * the sizes the client actually produces. Anything past the top bucket
 * collapses into one label: past that point the only question worth
 * answering is "bigger than the ceiling", and finer detail would start
 * to single out individual vaults.
 */
export function sizeBucket(bytes: number): string {
  if (bytes > BUCKET_CEILING_BYTES) return ">4MB";

  let bucket = SMALLEST_BUCKET_BYTES;
  while (bucket < bytes) bucket *= 2;

  return bucket >= 1024 * 1024
    ? `<=${bucket / (1024 * 1024)}MB`
    : `<=${bucket / 1024}KB`;
}

export function logEvent(fields: EventLogFields): void {
  // Defensive field pick. Even if the caller bypasses TypeScript, only
  // allow-listed fields reach the log.
  const safe: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    safe[key] = fields[key];
  }
  safe.ts = new Date().toISOString();
  console.log(JSON.stringify(safe));
}
