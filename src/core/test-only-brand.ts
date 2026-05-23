/**
 * Brand for adapters whose implementation is only safe to use in
 * tests / dev / self-host-without-Redis paths. In a multi-instance
 * production deployment, an in-memory adapter loses state on every cold
 * start — for sync it silently drops user vault PUTs, for the catalog it
 * makes the popular-feeds query return empty, for licenses it forgets
 * paid-tier records, for the Stripe seen-event store it double-processes
 * webhook retries.
 *
 * The brand is the second line of defence behind the resolver's mode
 * check: even if a future code path bypasses the resolver and constructs
 * a memory adapter directly, this brand still flags it. Resolvers call
 * {@link assertNotTestOnlyInProduction} at the point they hand the
 * adapter back to a caller; the call throws a loud module-load error
 * instead of letting the deploy come up with a silently broken backend.
 *
 * History: the 2026-05-12 sync regression and the 2026-05-14
 * stats-always-zero incident both had the same shape — a memory
 * fallback materialising in production. The incident remediation lists
 * this brand as the open follow-up.
 */

/**
 * Symbol.for so the brand survives a duplicated copy of this module if a
 * bundler decides to inline it into two places. A bare local Symbol would
 * produce two distinct symbols and the cross-realm check would fail.
 */
export const TEST_ONLY = Symbol.for("feedzero.testOnlyAdapter");

/** Mark `target` as a test-only adapter. Returns the same reference for chaining. */
export function markTestOnly<T extends object>(target: T): T {
  Object.defineProperty(target, TEST_ONLY, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return target;
}

/** True iff `target` was branded by {@link markTestOnly}. */
export function isTestOnly(target: unknown): boolean {
  if (target === null || typeof target !== "object") return false;
  return (target as Record<symbol, unknown>)[TEST_ONLY] === true;
}

/**
 * Throw if `target` is branded test-only and the environment is
 * production. Called at the resolver boundary so a misconfigured deploy
 * fails loudly at module-load time, not silently at the first user
 * write. The `contextLabel` is the only signal in the failure log telling
 * the operator WHICH resolver fell through — name it after the resolver.
 */
export function assertNotTestOnlyInProduction(
  target: unknown,
  contextLabel: string,
  env: Record<string, string | undefined> = process.env,
): void {
  if (env.NODE_ENV !== "production") return;
  if (!isTestOnly(target)) return;
  throw new Error(
    `[${contextLabel}] Refusing to use a test-only adapter in production. ` +
      `This usually means a backend credential (Upstash / Blob / Redis) is ` +
      `missing from the production environment and the resolver fell through ` +
      `to an in-memory test fixture. Check the deployment's environment ` +
      `variables before retrying.`,
  );
}
