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
import { isSelfHosted } from "./self-hosted.ts";

export function isPaidTierActive(): boolean {
  // Self-hosters never have an upgrade path, so the paid tier is forced
  // off regardless of VITE_PAID_TIER_VISIBLE. This is the single-switch
  // invariant: `VITE_SELF_HOSTED=1` is sufficient to hide every paid-tier
  // UI surface. Self-host operators don't need to know about the second
  // flag — it's an internal split for the hosted deployment's launch
  // phases (UI visibility vs API enforcement). See ADR 014.
  if (isSelfHosted()) return false;
  return import.meta.env.VITE_PAID_TIER_VISIBLE === "1";
}
