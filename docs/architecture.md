# Architecture

## Overview

FeedZero is a privacy-first RSS reader built with vanilla JavaScript (ES modules) and Web Components. Uses targeted libraries for security-critical code: DOMPurify (sanitization), Dexie.js (IndexedDB), and Defuddle (full-text extraction).

## Data Flow

```
User enters feed URL in <feed-list>
      │
      ▼
  Event bus emits feed:added
      │
      ▼
  main.js calls addFeedFlow(url)
      │
      ▼
  feed-service.js normalizes URL + checks for duplicate in DB
      │
      ▼
  fetch(/api/feed?url=...) via CORS proxy
      │
      ▼
  validator.js → Detects JSON Feed, RSS 2.0, or Atom 1.0
  (if parse fails → discovery.js tries autodiscovery, well-known paths, anchor scanning)
      │
      ▼
  parser.js → Extracts feed metadata + articles
      │
      ▼
  sanitizer.js → DOMPurify strips dangerous HTML
      │
      ▼
  schema.js → Creates Feed/Article objects with UUIDs
      │
      ▼
  crypto.js → Encrypts with AES-GCM-256 (PBKDF2-derived key)
      │
      ▼
  db.js → Dexie stores encrypted blobs in IndexedDB
      │
      ▼
  main.js refreshes feed list → auto-selects new feed → loads articles
```

### On-Demand Extraction (user-initiated)

```
User clicks "Extracted" in <article-view>
      │
      ▼
  fetch(/api/page?url=...) via CORS proxy
      │
      ▼
  extractor.js → defuddle-extractor.js (Defuddle parse)
      │
      ▼
  cleanup.js → Removes empty elements, collapses <br> tags
      │
      ▼
  sanitizer.js → DOMPurify strips dangerous HTML
      │
      ▼
  Cached in article-view → displayed (snaps back to Feed if similar)
```

### Feed Refresh

```
Auto-refresh on app load (non-blocking) OR manual refresh (per-feed / all)
      │
      ▼
  feed-service.js refreshFeed() → fetch → parse → for each article:
      │
      ├── New (guid not in DB) → store
      └── Existing + changed → update
```

## CORS Proxy

Browsers block cross-origin fetches. In development, `vite.config.js` defines a plugin with two proxy endpoints:

- `/api/feed?url=<encoded>` — fetches RSS/Atom/JSON feeds (default content-type: `text/xml`)
- `/api/page?url=<encoded>` — fetches article web pages for full-text extraction (default content-type: `text/html`)

Both use the same `proxyHandler()` function. Production will require a dedicated proxy or server function.

## Styling

Tailwind CSS v4 via `@tailwindcss/vite` (build-time only, zero runtime cost). Single CSS entry point: `src/ui/styles/app.css`.

- **`@theme`** — Design tokens (colors, spacing, fonts, radius) replacing the former `variables.css`
- **`@layer base`** — Global resets, layout grid, button/input base styles (formerly `base.css`)
- **Tailwind utilities** — Available in light DOM (`index.html` elements). Not used inside Web Components yet.
- **Web Component styles** — Scoped `<style>` blocks in Shadow DOM, using CSS custom properties inherited from the light DOM theme.

See [ADR 004](decisions/004-tailwind-css.md) for rationale.

## Module Dependency Graph

```
main.js
├── core/events/event-bus.js     (no deps)
├── core/feeds/feed-service.js
│   ├── core/discovery/discovery.js
│   │   └── core/discovery/strategies.js
│   ├── core/extractor/extractor.js
│   │   └── core/extractor/defuddle-extractor.js
│   │       ├── defuddle               (npm)
│   │       ├── core/extractor/cleanup.js
│   │       └── core/parser/sanitizer.js
│   ├── core/parser/parser.js
│   │   ├── core/parser/validator.js
│   │   │   └── utils/result.js
│   │   └── core/parser/sanitizer.js
│   │       └── dompurify            (npm)
│   ├── core/storage/schema.js
│   │   └── utils/result.js
│   └── core/storage/db.js
│       ├── dexie                    (npm)
│       └── core/storage/crypto.js
│           └── utils/constants.js
├── core/storage/db.js               (also used directly for getFeeds, getArticles, etc.)
├── ui/components/feed-list.js
├── ui/components/article-list.js
├── ui/components/article-view.js
└── ui/components/keyboard-nav.js
```

## Component Communication

All components communicate through the event bus — no direct references between them. `main.js` is the only orchestrator that wires event handlers.

Events: `feed:added`, `feed:selected`, `feed:removed`, `feed:updated`, `article:selected`, `article:read`, `storage:ready`, `storage:error`, `parse:error`, `feeds:refresh-all`, `feed:refresh`, `feeds:refreshed`

## Encryption Model

- Passphrase → PBKDF2 (100k iterations, SHA-256) → AES-GCM-256 key
- Salt generated once on first launch, stored in `meta` store, reused on subsequent opens
- Same passphrase + same salt = same key across sessions
- Each record encrypted with random 12-byte IV
- Stored as `{id, iv, ciphertext, ...indexFields}` — content encrypted, index fields in plaintext for Dexie queries
- Key derived once on app open, held in memory, cleared on close

## Storage Model

Dexie.js manages IndexedDB with these stores:

- `feeds` — keyPath: `id`, unique index: `url`
- `articles` — keyPath: `id`, indexes: `feedId`, `publishedAt`, `[feedId+guid]` (compound, for dedup)
- `meta` — keyPath: `key` (stores encryption salt)

Schema migrations are handled by Dexie's `version().stores()` API.
