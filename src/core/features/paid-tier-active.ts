/**
 * Build-time paid-tier launch flag.
 *
 * Set `VITE_PAID_TIER_VISIBLE=1` in `.env.production` (or the environment)
 * before `npm run build:all` to flip the app into "paid tier launched"
 * mode. Until this flag is "1":
 *
 *   - Subscribe UI surfaces are hidden (controlled by the same env at
 *     `app.tsx`).
 *   - /api/sync runs unauthenticated (server-side `LAUNCH_PAID_TIER`
 *     flag, see `src/core/flags/flags.ts`).
 *   - Feature gates relax: shipped Personal features are available to
 *     every user with `reason: "paid-tier-inactive"`.
 *   - Quotas relax: the Free-tier feed cap is not enforced, since
 *     there is no upgrade path for users to take when they hit it.
 *
 * Strict equality with the literal string `"1"` matches the convention
 * used elsewhere in the codebase (see `src/core/features/self-hosted.ts`
 * and `src/core/flags/flags.ts`).
 *
 * Distinct from `LAUNCH_PAID_TIER` (server-side, in `process.env`).
 * The split is deliberate: server-side gating governs API behavior;
 * client-side gating governs UI surfaces and honor-system quota/feature
 * checks.
 */
export function isPaidTierActive(): boolean {
  return import.meta.env.VITE_PAID_TIER_VISIBLE === "1";
}
