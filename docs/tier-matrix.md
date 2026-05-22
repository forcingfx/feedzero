# Tier matrix

_Generated from `src/core/features/tier-matrix.ts` via `npm run docs:tier-matrix`. Do not edit by hand._

Canonical reference for what FeedZero offers at each tier. Edit the TS module to change availability or limits; the gates and quotas read from it directly.

Legend:

- `✓` — available with no scope cap
- `N <unit>` — available, capped (e.g. `25 feeds`)
- `Unlimited` — available with the cap lifted
- `—` — not available on this tier
- _Coming soon_ entries describe the planned tier placement; the gate still returns `not-built` until the feature ships.

## Reading

| Feature | Free | Personal | Pro | Status |
|---|---|---|---|---|
| **Feed subscriptions** — Number of RSS, Atom, or JSON feeds you can subscribe to at once. | 50 feeds | Unlimited | Unlimited | Shipped |
| **Feed discovery** — Paste a site URL and FeedZero finds the feed via well-known paths and HTML link tags. | ✓ | ✓ | ✓ | Shipped |
| **Feed refresh** — Manual and automatic refresh of subscribed feeds. | ✓ | ✓ | ✓ | Shipped |
| **Full-text extraction** — Fetch and clean the full article body when the feed only provides a summary. | ✓ | ✓ | ✓ | Shipped |
| **Content view toggle** — Switch between feed content, extracted text, and original page. | ✓ | ✓ | ✓ | Shipped |
| **Global feed** — Merged view of articles from every subscribed feed. | ✓ | ✓ | ✓ | Shipped |
| **Starred articles** — Star articles for quick recall; starred items are kept indefinitely. | ✓ | ✓ | ✓ | Shipped |
| **Keyboard navigation** — j/k article nav, u/i feed nav, plus single-key actions for power users. | ✓ | ✓ | ✓ | Shipped |
| **Mobile navigation** — Touch-optimized single-panel layout with back navigation. | ✓ | ✓ | ✓ | Shipped |

## Organization

| Feature | Free | Personal | Pro | Status |
|---|---|---|---|---|
| **Remove feed** — Unsubscribe from a feed and drop its cached articles. | ✓ | ✓ | ✓ | Shipped |
| **OPML import / export** — Import a subscription list from another reader, or export your subscriptions. | ✓ | ✓ | ✓ | Shipped |
| **Article flood grouping** — Collapses bursts of items from chatty feeds so the article list stays scannable. | ✓ | ✓ | ✓ | Shipped |
| **Auto-organize** — One-click grouping of subscribed feeds into folders by topic. | — | ✓ | ✓ | Shipped |

## Sync and storage

| Feature | Free | Personal | Pro | Status |
|---|---|---|---|---|
| **Encrypted local storage** — All feed content is AES-GCM encrypted at rest in IndexedDB; index fields are HMAC-hashed. | ✓ | ✓ | ✓ | Shipped |
| **Cloud sync (zero-knowledge)** — Sync your subscriptions, folders, and read state across devices via an end-to-end encrypted vault. | ✓ | ✓ | ✓ | Shipped |
| **Offline prefetch** — Background prefetch of article bodies so they're available without a network. | — | ✓ | ✓ | Shipped |

## Filtering and search

| Feature | Free | Personal | Pro | Status |
|---|---|---|---|---|
| **Smart filters** — Saved queries combining feeds, keywords, authors, and read state. | — | ✓ | ✓ | Shipped |
| **Rules** — Per-feed auto-action rules: mute, star, mark-read, or route articles by title, author, content, date, and more. | — | ✓ | ✓ | Shipped |
| **Full-text search** — Search across every cached article body, title, and author. | — | — | ✓ | Coming soon |
| **Signal** — Topics emerging across your feeds, ranked by cross-feed term frequency. Fully local — no LLM, no third party. | — | ✓ | ✓ | Shipped |

## Delivery

| Feature | Free | Personal | Pro | Status |
|---|---|---|---|---|
| **Authenticated fetchers** — Fetch feeds behind HTTP basic auth, cookies, or signed URLs (Patreon, paywalled newsletters). | — | — | ✓ | Coming soon |
| **Send to Kindle** — One-click delivery of an article to your Kindle email address. | — | — | ✓ | Coming soon |
| **Bridges** — Turn non-RSS sources (YouTube channels, Reddit, Mastodon, GitHub repos) into feeds by mapping them to the native feed URL each already publishes. | — | ✓ | ✓ | Shipped |

## Appearance

| Feature | Free | Personal | Pro | Status |
|---|---|---|---|---|
| **Commercial themes** — Premium typography- and color-tuned themes. | — | — | ✓ | Coming soon |

## Support

| Feature | Free | Personal | Pro | Status |
|---|---|---|---|---|
| **In-app feedback** — Send a feedback message that opens a GitHub issue on the project. | ✓ | ✓ | ✓ | Shipped |

## Self-hosting and pre-launch

Two flags bypass the tier checks for shipped features (coming-soon features stay locked regardless):

- `VITE_SELF_HOSTED=1` — self-host bypass. The operator runs their own server; the gate reports `self-hosted-bypass`.
- `VITE_PAID_TIER_VISIBLE=0` — paid tier dormant. No Subscribe path exists yet, so Free users get full functionality with `paid-tier-inactive`.

See [ADR 012](decisions/012-open-core-feature-gating.md) for the rationale.
