/**
 * Subscribe-deeplink parser.
 *
 * The landing page (`www.feedzero.app/pricing`) links customers to the app
 * with `?subscribe=personal-yearly`. The app reads this on load and — if the
 * paid-tier flag is on — fires a Stripe Checkout Session for the price.
 *
 * Why a stable string instead of the raw Stripe price ID:
 *   - Stripe price IDs differ between test mode and live mode. Wiring the
 *     live ID into the landing page's HTML would prevent staging previews.
 *   - Customer-visible URLs would expose internal Stripe identifiers.
 *   - The mapping (priceKey → priceId) lives in env vars, so rotating a
 *     Stripe price (e.g. price increase, currency split) doesn't require a
 *     landing-page deploy.
 *
 * Defensive parsing rejects unknown keys so a malicious URL can't smuggle
 * an arbitrary string into our checkout call.
 */

/**
 * Both keys stay parseable even though billing is annual-only.
 *
 * `?subscribe=personal-monthly` links are already out in the world — on the
 * landing page, in the support runbook, in old emails — and rejecting them
 * would fail closed at the point of highest purchase intent. They resolve
 * to the annual price; see {@link resolvePriceId}.
 */
export const PRICE_KEYS = ["personal-monthly", "personal-yearly"] as const;
export type PriceKey = (typeof PRICE_KEYS)[number];

export interface SubscribeIntent {
  priceKey: PriceKey;
}

/**
 * Pure parser. Returns `null` for missing, empty, or unrecognized values —
 * the caller treats that as "no deeplink, render normally".
 */
export function parseSubscribeIntent(
  params: URLSearchParams,
): SubscribeIntent | null {
  const raw = params.get("subscribe");
  if (!raw) return null;
  if (!isPriceKey(raw)) return null;
  return { priceKey: raw };
}

function isPriceKey(value: string): value is PriceKey {
  return (PRICE_KEYS as readonly string[]).includes(value);
}

export interface PriceIdMap {
  personalYearly: string;
}

/**
 * Map a price key to its env-injected Stripe price ID. Returns null when
 * the env var is unset (e.g. local dev without Stripe wired) so the caller
 * can fail closed instead of hitting Stripe with an empty priceId.
 *
 * Every key resolves to the annual price: there is only one. The retired
 * `personal-monthly` key is deliberately not special-cased into a rejection
 * — an old link should still sell the plan that exists, not 404 the
 * customer.
 */
export function resolvePriceId(
  _key: PriceKey,
  map: PriceIdMap,
): string | null {
  return map.personalYearly ? map.personalYearly : null;
}
