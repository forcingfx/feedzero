/**
 * Canonical tier matrix — every user-facing feature with its per-tier
 * availability and scope/limit.
 *
 * This is the single source of truth referenced by `feature-gates.ts`
 * (binary capability gating) and `quotas.ts` (continuous limit gating).
 * Changing what a tier includes — lifting the Free feed cap, shipping a
 * coming-soon feature, moving a feature between tiers — starts here. The
 * markdown doc at `docs/tier-matrix.md` is regenerated from this module
 * via `npm run docs:tier-matrix`.
 *
 * Schema:
 *   - `id` is the kebab-case feature identifier consumed across the app.
 *   - `category` groups features in the generated doc (and only there).
 *   - `status: "coming-soon"` features have their `tiers` field describe
 *     what they WILL ship with — the gate still returns `not-built`
 *     until status flips to "shipped".
 *   - Each tier slot is either `{ available: false }` or
 *     `{ available: true, limit?: number | "unlimited", limitUnit?: string }`.
 *     `limit` is the scope/cap; `limitUnit` is the noun displayed in UI
 *     and docs (e.g. "feeds", "MB", "devices").
 *
 * Invariant (enforced by tests): if a feature is available on a lower
 * tier it must also be available on every higher tier — strictly
 * monotonic capability. Limits may differ.
 *
 * Honor-system caveat: as with the rest of the feature-gating layer,
 * the matrix lives in the client. A determined fork can flip any cell;
 * see ADR 012 for the rationale.
 */

import type { LicenseTier } from "../license/format";

export type Tier = LicenseTier;

export const TIER_ORDER: readonly Tier[] = ["free", "personal", "pro"] as const;

export type FeatureStatus = "shipped" | "coming-soon";

/**
 * Logical grouping for the generated doc. Order here controls section
 * order in `docs/tier-matrix.md`.
 */
export type FeatureCategory =
  | "reading"
  | "organization"
  | "sync-and-storage"
  | "filtering-and-search"
  | "delivery"
  | "appearance"
  | "support";

export const CATEGORY_ORDER: readonly FeatureCategory[] = [
  "reading",
  "organization",
  "sync-and-storage",
  "filtering-and-search",
  "delivery",
  "appearance",
  "support",
] as const;

export const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  reading: "Reading",
  organization: "Organization",
  "sync-and-storage": "Sync and storage",
  "filtering-and-search": "Filtering and search",
  delivery: "Delivery",
  appearance: "Appearance",
  support: "Support",
};

export type TierAvailability =
  | { available: false }
  | {
      available: true;
      /** Numeric cap, or "unlimited" when the tier removes the cap. Absent for binary features. */
      limit?: number | "unlimited";
      /** Noun for the limit (e.g. "feeds", "devices", "MB"). Required when `limit` is numeric. */
      limitUnit?: string;
    };

export interface TierMatrixEntry {
  id: string;
  name: string;
  description: string;
  category: FeatureCategory;
  status: FeatureStatus;
  tiers: Record<Tier, TierAvailability>;
  /**
   * Optional pricing-card bullet. Presence opts the feature into the
   * pricing grid; `rank` orders bullets (ascending) across the cards.
   * The card a bullet lands on is derived from the feature's lowest
   * unlock tier (`getRequiredTier`), so re-tiering a feature in the
   * matrix moves its bullet to the right card with zero edits to the
   * pricing components. `blurb` is the full bullet text (curated, since
   * marketing copy is punchier than the matrix `description`).
   */
  marketing?: { blurb: string; rank: number };
}

const AVAILABLE: TierAvailability = { available: true };
const UNAVAILABLE: TierAvailability = { available: false };
const UNLIMITED: TierAvailability = { available: true, limit: "unlimited" };

export const TIER_MATRIX = {
  // ── Reading ────────────────────────────────────────────────────────────
  "feed-subscriptions": {
    id: "feed-subscriptions",
    name: "Feed subscriptions",
    description:
      "Number of RSS, Atom, or JSON feeds you can subscribe to at once.",
    category: "reading",
    status: "shipped",
    tiers: {
      free: { available: true, limit: 50, limitUnit: "feeds" },
      personal: UNLIMITED,
      pro: UNLIMITED,
    },
  },
  "feed-discovery": {
    id: "feed-discovery",
    name: "Feed discovery",
    description:
      "Paste a site URL and FeedZero finds the feed via well-known paths and HTML link tags.",
    category: "reading",
    status: "shipped",
    tiers: { free: AVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
    marketing: { blurb: "1,300+ curated feeds in Explore", rank: 10 },
  },
  "feed-refresh": {
    id: "feed-refresh",
    name: "Feed refresh",
    description: "Manual and automatic refresh of subscribed feeds.",
    category: "reading",
    status: "shipped",
    tiers: { free: AVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
  },
  "full-text-extraction": {
    id: "full-text-extraction",
    name: "Full-text extraction",
    description:
      "Fetch and clean the full article body when the feed only provides a summary.",
    category: "reading",
    status: "shipped",
    tiers: { free: AVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
    marketing: { blurb: "Full-text extraction", rank: 13 },
  },
  "content-view-toggle": {
    id: "content-view-toggle",
    name: "Content view toggle",
    description: "Switch between feed content, extracted text, and original page.",
    category: "reading",
    status: "shipped",
    tiers: { free: AVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
  },
  "global-feed": {
    id: "global-feed",
    name: "Global feed",
    description: "Merged view of articles from every subscribed feed.",
    category: "reading",
    status: "shipped",
    tiers: { free: AVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
  },
  "starred-articles": {
    id: "starred-articles",
    name: "Starred articles",
    description: "Star articles for quick recall; starred items are kept indefinitely.",
    category: "reading",
    status: "shipped",
    tiers: { free: AVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
  },
  "keyboard-navigation": {
    id: "keyboard-navigation",
    name: "Keyboard navigation",
    description: "j/k article nav, u/i feed nav, plus single-key actions for power users.",
    category: "reading",
    status: "shipped",
    tiers: { free: AVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
  },
  "mobile-navigation": {
    id: "mobile-navigation",
    name: "Mobile navigation",
    description: "Touch-optimized single-panel layout with back navigation.",
    category: "reading",
    status: "shipped",
    tiers: { free: AVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
  },

  // ── Organization ───────────────────────────────────────────────────────
  "remove-feed": {
    id: "remove-feed",
    name: "Remove feed",
    description: "Unsubscribe from a feed and drop its cached articles.",
    category: "organization",
    status: "shipped",
    tiers: { free: AVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
  },
  "opml-import-export": {
    id: "opml-import-export",
    name: "OPML import / export",
    description:
      "Import a subscription list from another reader, or export your subscriptions.",
    category: "organization",
    status: "shipped",
    tiers: { free: AVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
    marketing: { blurb: "OPML import / export", rank: 12 },
  },
  "article-flood-grouping": {
    id: "article-flood-grouping",
    name: "Article flood grouping",
    description:
      "Collapses bursts of items from chatty feeds so the article list stays scannable.",
    category: "organization",
    status: "shipped",
    tiers: { free: AVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
  },
  "auto-organize": {
    id: "auto-organize",
    name: "Auto-organize",
    description:
      "One-click grouping of subscribed feeds into folders by topic.",
    category: "organization",
    status: "shipped",
    tiers: { free: UNAVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
    marketing: { blurb: "Auto-organize folders", rank: 22 },
  },

  // ── Sync and storage ───────────────────────────────────────────────────
  "encrypted-local-storage": {
    id: "encrypted-local-storage",
    name: "Encrypted local storage",
    description:
      "All feed content is AES-GCM encrypted at rest in IndexedDB; index fields are HMAC-hashed.",
    category: "sync-and-storage",
    status: "shipped",
    tiers: { free: AVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
    marketing: { blurb: "Offline support", rank: 14 },
  },
  "cloud-sync": {
    id: "cloud-sync",
    name: "Cloud sync (zero-knowledge)",
    description:
      "Sync your subscriptions, folders, and read state across devices via an end-to-end encrypted vault.",
    category: "sync-and-storage",
    status: "shipped",
    tiers: { free: AVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
    marketing: { blurb: "End-to-end encrypted cloud sync across devices", rank: 11 },
  },
  "offline-prefetch": {
    id: "offline-prefetch",
    name: "Offline prefetch",
    description:
      "Background prefetch of article bodies so they're available without a network.",
    category: "sync-and-storage",
    status: "shipped",
    tiers: { free: UNAVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
    marketing: {
      blurb: "Offline prefetch — article bodies cached for plane mode",
      rank: 23,
    },
  },

  // ── Filtering and search ───────────────────────────────────────────────
  filters: {
    id: "filters",
    name: "Smart filters",
    description:
      "Saved queries combining feeds, keywords, authors, and read state.",
    category: "filtering-and-search",
    status: "shipped",
    tiers: { free: UNAVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
    marketing: {
      blurb: "Smart filters — query your feeds by keyword, tag, or source",
      rank: 21,
    },
  },
  rules: {
    id: "rules",
    name: "Rules",
    description:
      "Per-feed auto-action rules: mute, star, mark-read, or route articles by title, author, content, date, and more.",
    category: "filtering-and-search",
    status: "shipped",
    tiers: { free: UNAVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
  },
  search: {
    id: "search",
    name: "Full-text search",
    description: "Search across every cached article body, title, and author.",
    category: "filtering-and-search",
    status: "coming-soon",
    tiers: { free: UNAVAILABLE, personal: UNAVAILABLE, pro: AVAILABLE },
    marketing: { blurb: "Full-text search across articles", rank: 30 },
  },
  signal: {
    id: "signal",
    name: "Signal",
    description:
      "Topics emerging across your feeds, ranked by cross-feed term frequency. Fully local — no LLM, no third party.",
    category: "filtering-and-search",
    status: "shipped",
    tiers: { free: UNAVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
    marketing: { blurb: "Signal — topics emerging across your feeds", rank: 20 },
  },
  "signal-briefings": {
    id: "signal-briefings",
    name: "Signal Briefings",
    description:
      "Standing AI-written briefings on the topics you care about, with citations drawn from your own feeds. Bring your own Claude API key — FeedZero never sees your prompts or articles.",
    category: "filtering-and-search",
    status: "shipped",
    tiers: {
      free: UNAVAILABLE,
      personal: { available: true, limit: 10, limitUnit: "briefings" },
      pro: { available: true, limit: 10, limitUnit: "briefings" },
    },
    marketing: {
      blurb: "Signal Briefings — standing AI briefs from your feeds, with citations",
      rank: 19,
    },
  },

  // ── Delivery ───────────────────────────────────────────────────────────
  "authenticated-fetchers": {
    id: "authenticated-fetchers",
    name: "Authenticated fetchers",
    description:
      "Fetch feeds behind HTTP basic auth, cookies, or signed URLs (Patreon, paywalled newsletters).",
    category: "delivery",
    status: "coming-soon",
    tiers: { free: UNAVAILABLE, personal: UNAVAILABLE, pro: AVAILABLE },
    marketing: { blurb: "Authenticated fetchers", rank: 32 },
  },
  "send-to-kindle": {
    id: "send-to-kindle",
    name: "Send to Kindle",
    description: "One-click delivery of an article to your Kindle email address.",
    category: "delivery",
    status: "coming-soon",
    tiers: { free: UNAVAILABLE, personal: UNAVAILABLE, pro: AVAILABLE },
    marketing: { blurb: "Send to Kindle", rank: 31 },
  },
  bridges: {
    id: "bridges",
    name: "Bridges",
    description:
      "Turn non-RSS sources (YouTube channels, Reddit, Mastodon, GitHub repos) into feeds by mapping them to the native feed URL each already publishes.",
    category: "delivery",
    status: "shipped",
    tiers: { free: UNAVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
  },

  // ── Appearance ─────────────────────────────────────────────────────────
  "themes-commercial": {
    id: "themes-commercial",
    name: "Commercial themes",
    description: "Premium typography- and color-tuned themes.",
    category: "appearance",
    status: "coming-soon",
    tiers: { free: UNAVAILABLE, personal: UNAVAILABLE, pro: AVAILABLE },
  },

  // ── Support ────────────────────────────────────────────────────────────
  feedback: {
    id: "feedback",
    name: "In-app feedback",
    description: "Send a feedback message that opens a GitHub issue on the project.",
    category: "support",
    status: "shipped",
    tiers: { free: AVAILABLE, personal: AVAILABLE, pro: AVAILABLE },
  },
} as const satisfies Record<string, TierMatrixEntry>;

export type FeatureId = keyof typeof TIER_MATRIX;

/** Lookup helper that returns the entry by id with full type narrowing. */
export function getEntry<Id extends FeatureId>(id: Id): (typeof TIER_MATRIX)[Id] {
  return TIER_MATRIX[id];
}

/** Per-tier availability slot. */
export function getAvailability(id: FeatureId, tier: Tier): TierAvailability {
  return TIER_MATRIX[id].tiers[tier];
}

/**
 * Numeric or "unlimited" limit for a feature on a tier. Returns undefined
 * when the feature is unavailable on that tier, or available with no cap
 * specified (binary feature).
 */
export function getLimit(id: FeatureId, tier: Tier): number | "unlimited" | undefined {
  const slot = TIER_MATRIX[id].tiers[tier];
  if (!slot.available) return undefined;
  return slot.limit;
}

/**
 * Lowest tier on which the feature is available. Falls back to the
 * highest tier ("pro") if no tier has it — that's only true for an
 * entry whose every slot is `{ available: false }`, which the schema
 * shouldn't allow but we default safely.
 */
export function getRequiredTier(id: FeatureId): Tier {
  for (const tier of TIER_ORDER) {
    if (TIER_MATRIX[id].tiers[tier].available) return tier;
  }
  return "pro";
}

/** A feature is "gated" if at least one tier doesn't have it. */
export function isGated(id: FeatureId): boolean {
  const t = TIER_MATRIX[id].tiers;
  return !t.free.available || !t.personal.available || !t.pro.available;
}

// ── Matrix-derived gate messaging ──────────────────────────────────────
//
// Every upgrade surface (toasts, splashes, inline lock badges) derives its
// copy from these helpers, so editing a feature's `name` or moving it
// between tiers in the matrix flows through the whole app with no string
// edits at the call sites. Tests in `gate-messaging.test.ts` lock this.

const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  personal: "Personal",
  pro: "Pro",
};

/** Human-readable tier label, e.g. "Personal". */
export function tierLabel(tier: Tier): string {
  return TIER_LABEL[tier];
}

/** The matrix display name, e.g. "Smart filters", "Signal", "Rules". */
export function featureName(id: FeatureId): string {
  return TIER_MATRIX[id].name;
}

/** Capitalized label of the lowest tier that unlocks the feature. */
export function requiredTierLabel(id: FeatureId): string {
  return TIER_LABEL[getRequiredTier(id)];
}

/** The matrix description, reused on every upgrade surface. */
export function gateDescription(id: FeatureId): string {
  return TIER_MATRIX[id].description;
}

/**
 * Canonical one-line gate copy for toasts and CTAs. Grammar-neutral so it
 * reads correctly for singular ("Signal") and plural ("Smart filters",
 * "Rules") feature names alike.
 */
export function gateToast(id: FeatureId): string {
  return `Subscribe to ${requiredTierLabel(id)} to unlock ${featureName(id)}.`;
}

// ── Pricing-card bullets (matrix-derived) ──────────────────────────────

export interface PricingBullet {
  id: FeatureId;
  blurb: string;
}

/**
 * Typed accessor for an entry's optional `marketing` field. The matrix is
 * declared `as const`, so indexing by a general `FeatureId` yields a union
 * of literal entry types where `marketing` is absent on most members;
 * reading it directly fails the type-checker. This view widens to the
 * interface so callers (and tests) get `{ blurb, rank } | undefined`.
 */
export function getMarketing(
  id: FeatureId,
): { blurb: string; rank: number } | undefined {
  return (TIER_MATRIX[id] as TierMatrixEntry).marketing;
}

/**
 * Pricing-card bullets for `tier`: marketed features whose lowest unlock
 * tier is exactly this tier, ordered by marketing rank. The pricing
 * components render these after their structural lead bullets
 * ("Everything in Free", "Unlimited feeds"). Re-tiering a feature in the
 * matrix moves its bullet to the correct card automatically — the cards
 * never name features directly. `pricing-bullets.test.ts` locks this.
 */
export function pricingBullets(tier: Tier): PricingBullet[] {
  return (Object.keys(TIER_MATRIX) as FeatureId[])
    .filter((id) => getMarketing(id) !== undefined)
    .filter((id) => getRequiredTier(id) === tier)
    .sort((a, b) => getMarketing(a)!.rank - getMarketing(b)!.rank)
    .map((id) => ({ id, blurb: getMarketing(id)!.blurb }));
}

/**
 * Explicit literal tuple of gated feature ids.
 *
 * Listed by hand (rather than filtered at runtime from the matrix) so the
 * `Feature` union in `feature-gates.ts` stays a narrow literal union —
 * `gateState("feed-discovery", ...)` then fails at type-check time, not
 * at runtime with `FEATURE_MAP[id]` returning undefined. The `satisfies`
 * clause checks every id is a real matrix key, and the test
 * `GATED_FEATURE_IDS matches isGated for every entry` enforces the
 * reverse — adding a gated feature to the matrix without listing it
 * here fails the suite.
 */
export const GATED_FEATURE_IDS = [
  "auto-organize",
  "offline-prefetch",
  "filters",
  "rules",
  "search",
  "signal",
  "signal-briefings",
  "authenticated-fetchers",
  "send-to-kindle",
  "bridges",
  "themes-commercial",
] as const satisfies readonly FeatureId[];
