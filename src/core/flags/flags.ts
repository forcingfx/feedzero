/**
 * Kill switches and feature flags.
 *
 * First-pass implementation: env-var only. A later iteration will read from
 * Vercel KV (or equivalent) so an operator can flip a flag without redeploying.
 *
 * Source-of-truth rule: a flag is enabled iff its env var is the literal
 * string "1". "true", "yes", "on", "0", "" — all of these are NOT enabled.
 * The strict equality is deliberate so "did I enable maintenance mode?" has
 * an unambiguous answer in an incident.
 *
 * See docs/internal/strategy.md §6.4 (Kill switches) for the full menu.
 */

/**
 * Every kill switch / feature flag the operator can flip.
 *
 * All day-one flags from strategy §6.4 are enumerated here even though only
 * MAINTENANCE_MODE is wired into a code path in this PR. Listing them all
 * gives downstream code a single source of truth for which strings are valid.
 */
export type FlagName =
  | "MAINTENANCE_MODE"
  | "KILL_BRIDGES"
  | "KILL_AI"
  | "KILL_ALERTS"
  | "KILL_FETCHERS"
  | "KILL_SIGNUPS"
  | "READONLY_SYNC"
  /**
   * Master pre-launch gate for Phase 1 (paid tier). When unset/0, the paid
   * features ship dormant: /api/sync stays free, frontend hides Subscribe.
   * When set to "1", /api/sync requires a Bearer license (PR W) and the
   * frontend reveals the Subscribe surface (PR Y, via VITE_*).
   *
   * Intentionally distinct from KILL_SIGNUPS, which is operational
   * (turn off NEW signups during incident, paid tier still active for
   * existing customers).
   */
  | "LAUNCH_PAID_TIER";

/**
 * Returns true iff the named flag is enabled.
 *
 * @param name - One of the supported FlagName values.
 * @param env - Environment map. Defaults to process.env. Injectable for tests
 *              and for callers that want to scope flag reads to a request.
 */
export function isFlagEnabled(
  name: FlagName,
  env: Record<string, string | undefined> = process.env,
): boolean {
  // Self-host master switch: SELF_HOSTED=1 suppresses every paid-tier
  // flag, regardless of how those flags are individually set. Server-side
  // mirror of `isPaidTierActive`'s client-side rule. Kill switches and
  // operational flags (MAINTENANCE_MODE, KILL_*) are unaffected — a
  // self-hoster still needs to drain traffic during an upgrade. See ADR 014.
  if (env.SELF_HOSTED === "1" && name === "LAUNCH_PAID_TIER") return false;
  return env[name] === "1";
}
