/**
 * Server-controlled allowlist of Stripe price IDs the Checkout endpoint
 * is willing to create sessions for.
 *
 * Why an env var (not hard-coded): price IDs change between Stripe sandbox
 * and live mode, between accounts, and when prices are archived/replaced.
 * Hard-coding would force a redeploy per change.
 *
 * Format: comma-separated, whitespace-tolerant.
 *   STRIPE_ALLOWED_PRICES=price_a,price_b,price_c
 *
 * Empty/missing → empty array → handler rejects every request with
 * 400 "priceId not in allowlist". Fail-closed: better to reject all
 * checkouts than to allow arbitrary price IDs through.
 */

export function resolveAllowedPrices(
  env: Record<string, string | undefined> = process.env,
): readonly string[] {
  const raw = env.STRIPE_ALLOWED_PRICES;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
