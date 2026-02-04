# Architecture

## Overview

FeedZero is a privacy-first RSS reader built with React + TypeScript. Core business logic lives in framework-agnostic TypeScript modules (`src/core/`, `src/utils/`). The UI uses React components with Zustand for state management, React Router for navigation, and Tailwind CSS v4 for styling.

See [ADR 005](decisions/005-react-migration.md) for the migration rationale.

## Data Flow

```
User enters feed URL in AddFeedForm
      │
      ▼
  feed-store.addFeed(url) — Zustand action
      │
      ▼
  feed-service.ts addFeedFlow(url)
      │
      ▼
  Normalizes URL + checks for duplicate in DB
      │
      ▼
  fetch(/api/feed?url=...) via CORS proxy
      │
      ▼
  validator.ts → Detects JSON Feed, RSS 2.0, or Atom 1.0
  (if parse fails → discovery.ts tries autodiscovery, well-known paths, anchor scanning)
      │
      ▼
  parser.ts → Extracts feed metadata + articles
      │
      ▼
  sanitizer.ts → DOMPurify strips dangerous HTML
      │
      ▼
  schema.ts → Creates Feed/Article objects with UUIDs
      │
      ▼
  crypto.ts → Encrypts with AES-GCM-256 (PBKDF2-derived key)
      │
      ▼
  db.ts → Dexie stores encrypted blobs in IndexedDB
      │
      ▼
  Store reloads feeds → auto-selects new feed → navigates to /feeds/:feedId
```

### On-Demand Extraction (user-initiated)

```
User clicks "Extracted" in ViewToggle
      │
      ▼
  extraction-store.fetchExtracted(url)
      │
      ▼
  fetch(/api/page?url=...) via CORS proxy
      │
      ▼
  extractor.ts → defuddle-extractor.ts (Defuddle parse)
      │
      ▼
  cleanup.ts → Removes empty elements, collapses <br> tags
      │
      ▼
  sanitizer.ts → DOMPurify strips dangerous HTML
      │
      ▼
  Cached in extraction store → displayed (hidden if not meaningfully richer)
```

### Feed Refresh

```
Auto-refresh on app load (non-blocking) OR manual refresh (per-feed / all)
      │
      ▼
  feed-service.ts refreshFeed() → fetch → parse → for each article:
      │
      ├── New (guid not in DB) → store
      └── Existing + changed → update
```

## State Management

Zustand stores bridge React components and core modules:

```
React Components
      │  (subscribe to store slices)
      ▼
Zustand Stores (app, feed, article, extraction)
      │  (call core module functions directly)
      ▼
Core Modules (framework-agnostic TypeScript)
      │
      ▼
IndexedDB (encrypted via Dexie + Web Crypto)
```

- **app-store** — DB initialization, global error state, onboarding status. `initializeReturningUser()` handles returning-user flow (detect storage mode, open DB, optionally pull sync).
- **feed-store** — Feed CRUD, selection, refresh. Debounces concurrent refreshAll calls. Triggers sync push after mutations.
- **article-store** — Article list for selected feed, selection (auto-marks read), read state. Triggers sync push after mark-as-read.
- **extraction-store** — Extraction cache (link → HTML), view mode toggle, fetch status
- **sync-store** — Cloud sync state: `enableSync`, `restoreSync`, `push`, `pull`, `scheduleSyncPush` (5s debounce), `disableSync` (deletes server vault + clears local state). Passphrase persistence in localStorage.

## Routing

```
/feeds                                → Feed list
/feeds/:feedId                        → Article list (+ feed list on desktop)
/feeds/:feedId/articles/:articleId    → Reader (+ all panels on desktop)
```

URL is the source of truth for navigation. `FeedsPage` syncs URL params to Zustand stores. Desktop (≥1024px) shows all 3 panels in a CSS grid. Mobile (<1024px) shows one panel at a time with back navigation.

## CORS Proxy & API Layer

All API handlers use the Web standard `Request -> Response` pattern via shared handler functions (`proxy-handler.ts`, `sync-handler.ts`). Three entry points consume them:

- **`server.ts`** — Hono standalone server for self-hosting (`npm run serve`)
- **`api/*.ts`** — Vercel Serverless Functions. In git, these are thin wrappers that import shared handlers from `src/core/`. During `npm run build:all`, `scripts/build-api.js` replaces their content with self-contained esbuild bundles (all deps inlined) because Vercel's builder does not bundle cross-directory imports. See ADR 007.
- **`vite.config.js`** — Dev proxy using lazy-imported shared handlers with a memory adapter for sync.

Endpoints:

- `/api/feed?url=<encoded>` — Proxies RSS/Atom/JSON feed requests (CORS bypass)
- `/api/page?url=<encoded>` — Proxies web page requests for full-text extraction
- `/api/sync` — GET retrieves encrypted vault, PUT stores encrypted vault, DELETE removes encrypted vault

### SSRF Protection

All proxy endpoints block internal/private IPs (localhost, 127.0.0.1, ::1, 10.x, 172.16-31.x, 192.168.x, 169.254.169.254) and only allow http/https protocols.

## Styling

Tailwind CSS v4 via `@tailwindcss/vite` (build-time only, zero runtime cost). Single CSS entry point: `src/index.css`.

- **`@theme`** — Design tokens (colors, spacing, fonts, radius)
- **`@layer base`** — Global resets, 3-panel grid layout, button/input base styles
- **Tailwind utilities** — Used in JSX `className` props via `cn()` helper (clsx + tailwind-merge)

See [ADR 004](decisions/004-tailwind-css.md) for Tailwind rationale.

## Module Dependency Graph

```
main.tsx → app.tsx
├── stores/app-store.ts → core/storage/db.ts
├── stores/feed-store.ts
│   ├── core/feeds/feed-service.ts
│   │   ├── core/discovery/discovery.ts
│   │   │   └── core/discovery/strategies.ts
│   │   ├── core/parser/parser.ts
│   │   │   ├── core/parser/validator.ts
│   │   │   └── core/parser/sanitizer.ts (dompurify)
│   │   ├── core/storage/schema.ts (utils/result.ts)
│   │   └── core/storage/db.ts
│   │       ├── dexie (npm)
│   │       └── core/storage/crypto.ts (utils/constants.ts)
│   └── core/storage/db.ts
├── stores/article-store.ts → core/storage/db.ts
├── stores/extraction-store.ts → core/extractor/extractor.ts
│   └── core/extractor/defuddle-extractor.ts
│       ├── defuddle (npm)
│       ├── core/extractor/cleanup.ts
│       └── core/parser/sanitizer.ts
├── pages/feeds-page.tsx
│   ├── components/feeds/ (feed-list, feed-item, add-feed-form)
│   ├── components/articles/ (article-list, article-item)
│   ├── components/reader/ (reader-panel, view-toggle, article-content)
│   └── hooks/ (use-keyboard-nav, use-media-query)
└── index.css (Tailwind)
```

## Encryption Model

- Passphrase → PBKDF2 (100k iterations, SHA-256) → AES-GCM-256 key
- Salt generated once on first launch, stored in `meta` store, reused on subsequent opens
- Same passphrase + same salt = same key across sessions
- Each record encrypted with random 12-byte IV
- Stored as `{id, iv, ciphertext, ...indexFields}` — content encrypted, index fields in plaintext for Dexie queries
- Key derived once on app open, held in memory, cleared on close

## Zero-Knowledge Sync

Optional cloud sync that stores only opaque encrypted blobs on the server. See [Feature 008](features/008-zero-knowledge-sync.md) and [ADR 006](decisions/006-sync-storage-and-passphrase.md).

- Passphrase derives both vault ID (lookup key) and encryption key via separate PBKDF2 derivations
- Full-state sync: entire vault pushed/pulled as one encrypted blob
- Storage adapter pattern: filesystem (default), Vercel Blob (opt-in), memory (dev/tests)
- Standalone Hono server (`server.ts`) for self-hosting; Vercel wrappers for cloud deployment

## Storage Model

Dexie.js manages IndexedDB with these stores:

- `feeds` — keyPath: `id`, unique index: `url`
- `articles` — keyPath: `id`, indexes: `feedId`, `publishedAt`, `[feedId+guid]` (compound, for dedup)
- `meta` — keyPath: `key` (stores encryption salt)

Schema migrations are handled by Dexie's `version().stores()` API.
