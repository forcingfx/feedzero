/**
 * Subscribe-deeplink parser.
 *
 * The landing page (`www.feedzero.app/pricing`) links customers to the app
 * with `?subscribe=personal-monthly` (or `personal-yearly`). The app reads
 * this on load and — if the paid-tier flag is on — fires a Stripe Checkout
 * Session for the matching price.
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
  personalMonthly: string;
  personalYearly: string;
}

/**
 * Map a price key to its env-injected Stripe price ID. Returns null when
 * the corresponding env var is unset (e.g. local dev without Stripe wired)
 * so the caller can fail closed instead of hitting Stripe with an empty
 * priceId.
 */
export function resolvePriceId(
  key: PriceKey,
  map: PriceIdMap,
): string | null {
  const id = key === "personal-monthly" ? map.personalMonthly : map.personalYearly;
  return id ? id : null;
}
