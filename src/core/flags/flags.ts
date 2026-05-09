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
  | "READONLY_SYNC";

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
  return env[name] === "1";
}
