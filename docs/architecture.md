# Architecture

This document covers both the technical architecture and privacy model of FeedZero. For security-conscious users who want to understand exactly what data leaves their browser and how it is protected, see the [Privacy & Threat Model](#privacy--threat-model) section.

## Overview

FeedZero is a privacy-first RSS reader built with React + TypeScript. Core business logic lives in framework-agnostic TypeScript modules (`src/core/`, `src/utils/`). The UI uses React components with Zustand for state management, React Router for navigation, and Tailwind CSS v4 for styling.

All feed parsing, article storage, and UI rendering happen in the browser. The only server-side components are:

1. **CORS proxy** — Fetches feed XML/JSON and web pages on behalf of the browser (required because browsers block cross-origin requests to arbitrary domains)
2. **Sync endpoint** (optional) — Stores an encrypted blob for cross-device sync

A companion **browser extension** (`extension/`, see [Feature 019](features/019-authenticated-fetch.md) and [ADR 020](decisions/020-browser-extension-surface.md)) is an additive, opt-in surface that fetches paywalled articles using the user's existing browser session against the publisher. Credentials never touch FeedZero's servers; the extension is pure transport between the web app and the publisher's origin, authorized one domain at a time via Chrome's native host-permission prompt.

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
  POST /api/feed via CORS proxy
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
  POST /api/page via CORS proxy
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
  [Sync users only] Pull vault from server → reload feeds from DB
      │
      ▼
  feed-service.ts refreshFeed() → fetch → parse → for each article:
      │
      ├── New (guid not in DB) → store
      └── Existing + changed → update
      │
      ▼
  [Sync users only] Schedule debounced push
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
- **sync-store** — Cloud sync state: `enableSync`, `restoreSync`, `push`, `pull`, `scheduleSyncPush` (5s debounce + 0-30s jitter), `disableSync` (deletes server vault + clears stored keys), `logout` (clears local data, preserves cloud vault). Stores `credentials: SyncCredentials | null` (pre-derived vault ID + CryptoKey); raw passphrase is never persisted.
- **signal-store** — Drives `/signal`. Status state machine (`locked | loading | ready | error`), 24h localStorage cache (`feedzero:signal-report`). `loadReport({ force? })` collects every article from `article-store`, checks the 100-article gate, runs `generateReport()` from `core/signal/frequency-engine` (pure-TS frequency analysis), and writes the result to cache. No network, no LLM.

## Routing

```
/feeds                                → Feed list
/feeds/:feedId                        → Article list (+ feed list on desktop)
/feeds/:feedId/articles/:articleId    → Reader (+ all panels on desktop)
/signal                               → Cross-feed topic frequency surface (Personal+, gated at 100-article corpus)
/explore                              → Catalog + add-feed
/stats                                → Vault stats dashboard
/settings                             → Settings (account, subscription, help)
```

URL is the source of truth for navigation. `FeedsPage` syncs URL params to Zustand stores. Desktop (≥1024px) shows all 3 panels in a CSS grid. Mobile (<1024px) shows one panel at a time with back navigation.

## CORS Proxy & API Layer

All API handlers use the Web standard `Request -> Response` pattern via shared handler functions (`proxy-handler.ts`, `sync-handler.ts`). Three entry points consume them:

- **`server.ts`** — Hono standalone server for self-hosting (`npm run serve`)
- **`api/*.ts`** — Vercel Serverless Functions. In git, these are thin wrappers that import shared handlers from `src/core/`. During `npm run build:all`, `scripts/build-api.js` replaces their content with self-contained esbuild bundles (all deps inlined) because Vercel's builder does not bundle cross-directory imports. See ADR 007.
- **`vite.config.js`** — Dev proxy using lazy-imported shared handlers with a memory adapter for sync.

Endpoints:

- `POST /api/feed` (body: `{ "url": "..." }`) — Proxies RSS/Atom/JSON feed requests (CORS bypass). Rate-limited per hashed client (300/min default).
- `POST /api/page` (body: `{ "url": "..." }`) — Proxies web page requests for full-text extraction. Rate-limited.
- `/api/sync` — GET / HEAD / PUT / DELETE encrypted vault. Storage: Upstash KV (`vault:<vaultId>`).
- `/api/catalog` — `action=count`, `action=popular`, `?url=<...>` lookup. Storage: Upstash KV (`catalog:feed:*` + `catalog:ranking` sorted set).
- `/api/stats-sync` — Vault count for the public stats page. Reads the same backend as `/api/sync`.
- `POST /api/license/verify`, `POST /api/license/issue` — License Bearer-token verification and (admin-only) issuance. Storage: Upstash KV (`license:record:*`, `license:revoked:*`, `customer:*:keys`).
- `POST /api/stripe/webhook` — Stripe webhook receiver with signature verification + event-id dedup. Dedup store: Upstash KV (`seen-event:<eventId>`). `customer.subscription.created` reads `current_period_end` (trial-end date for trialing subscriptions) and pins the issued license to it; `invoice.paid` extends the license on first charge.
- `POST /api/checkout/create-session` — Stripe Checkout Session creation with priceId allowlist. Injects a server-controlled 30-day free trial via `subscription_data.trial_period_days` — see [ADR 015](decisions/015-stripe-side-trial.md).
- `GET /api/health`, `GET /api/icon`, `POST /api/feedback`, `GET /api/favicon` — Operational endpoints.

### Production data layer: Upstash KV

Per [ADR 008](decisions/008-upstash-as-production-data-layer.md), five distinct server-side concerns share one Upstash REST KV instance with non-overlapping key prefixes (`license:*`, `customer:*`, `vault:*`, `seen-event:*`, `catalog:*`, `ratelimit:*`). The credential cascade `UPSTASH_REDIS_REST_URL/TOKEN` → `KV_REST_API_URL/TOKEN` → memory fallback is shared by every adapter, so an operator configures Upstash once and all five subsystems pick it up.

This consolidation replaced the prior architecture (Vercel Blob for sync, separate Upstash for license/event-store, in-memory for catalog) after two production-down incidents in May 2026 demonstrated that "multiple production backends" was a recurring failure mode. See [the postmortems](incidents/) for the case studies.

### SSRF Protection

All proxy endpoints block internal/private IPs (localhost, 127.0.0.1, ::1, 10.x, 172.16-31.x, 192.168.x, 169.254.169.254) and only allow http/https protocols.

### Proxy Rate Limiting

`/api/feed` and `/api/page` rate-limit at 300 requests per 60-second window per hashed client. Client ID = SHA-256 of `${ip}|${userAgent}|${salt}`, salt sourced from `RATE_LIMIT_HASH_SALT` env var (fallback `LICENSE_SIGNING_KEY`). Counter stored as `ratelimit:cli_<8-hex>` in Upstash with TTL = window length. Fails open on Upstash errors (a broken limiter shouldn't take the proxy down). 429 responses include `Retry-After` (RFC 6585). See [ADR 010](decisions/010-proxy-rate-limiter.md).

### Observability

Every monetization handler (sync, license/verify, license/issue, stripe/webhook, checkout) mints a `traceId` at request entry (`req_<8-hex>`), includes it in every non-2xx response body, and emits a structured `console.error` JSON line on every 5xx via an allow-list logger. Each `api/*.ts` wrapper writes a module-load log line surfacing which adapter resolved (`[sync] adapter=upstash`, etc.). See [ADR 009](decisions/009-observability-trace-id-pattern.md).

## Styling

Tailwind CSS v4 via `@tailwindcss/vite` (build-time only, zero runtime cost). Single CSS entry point: `src/index.css`.

- **`@theme`** — Design tokens (colors, spacing, fonts, radius)
- **`@layer base`** — Global resets, button/input base styles (the desktop layout itself is a two-tier `ResizablePanelGroup` in `feeds-page.tsx`, not a CSS grid — see ADR 013)
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
├── stores/signal-store.ts → core/signal/frequency-engine.ts
│   ├── core/signal/tokenize.ts
│   └── core/signal/types.ts
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
- Index fields (url, feedId, guid) are HMAC-SHA256 hashed before storage — deterministic for querying, non-reversible
- Stored as `{id, iv, ciphertext, url: "<hmac>", feedId: "<hmac>", guid: "<hmac>"}` — content encrypted, index fields hashed
- On first use, all keys are derived from passphrase, exported as JWK, and persisted to localStorage. The raw passphrase is discarded.
- On subsequent opens, `openWithKeys()` imports JWKs directly — no passphrase needed.
- Legacy users with stored passphrases are auto-migrated (keys derived, stored, passphrase removed).

## Zero-Knowledge Sync

Optional cloud sync that stores only opaque encrypted blobs on the server. See [Feature 008](features/008-zero-knowledge-sync.md) and [ADR 006](decisions/006-sync-storage-and-passphrase.md).

- Passphrase derives both vault ID (lookup key) and encryption key via separate PBKDF2 derivations
- Full-state sync: entire vault pushed/pulled as one encrypted blob
- Storage adapter pattern: filesystem (default), Vercel Blob (opt-in), memory (dev/tests)
- Standalone Hono server (`server.ts`) for self-hosting; Vercel wrappers for cloud deployment

## Testing

Three-tier strategy. Full details in [Testing Strategy](testing-strategy.md).

```
┌─────────────────────────────────────────────────────┐
│  E2E Tests (Playwright)                              │
│  9 spec files, 56 tests                              │
│  Desktop (1280x720) + Mobile (393x851)               │
│  Real Chromium, Vite dev server on port 3001         │
├─────────────────────────────────────────────────────┤
│  Structural Assertions (Vitest + RTL)                │
│  7 test files, ~57 tests                             │
│  CSS classes, ARIA attributes, DOM composition       │
├─────────────────────────────────────────────────────┤
│  Unit / Integration Tests (Vitest + happy-dom)       │
│  ~50 test files, 500+ tests                          │
│  Core modules, stores, components, hooks             │
└─────────────────────────────────────────────────────┘
```

Test files mirror `src/` under `tests/`. Vitest matches `*.test.{js,ts,tsx}`. Playwright matches `*.spec.ts` in `tests/e2e/`.

Coverage thresholds: 90% statements/lines/functions, 83% branches. shadcn/ui wrappers (`src/components/ui/**`) and type-only files excluded from coverage.

## Storage Model

Dexie.js manages IndexedDB with these stores:

- `feeds` — keyPath: `id`, unique index: `url` (HMAC-hashed)
- `articles` — keyPath: `id`, indexes: `feedId` (HMAC-hashed), `[feedId+guid]` (compound, both HMAC-hashed)
- `meta` — keyPath: `key` (stores encryption salt)

Schema migrations are handled by Dexie's `version().stores()` API.

---

## Privacy & Threat Model

### What FeedZero protects against

| Threat | Mitigation |
|--------|------------|
| Server reading your feed list or articles | All data encrypted client-side before upload; server stores opaque blobs |
| Server correlating your identity with feeds | Vault ID derived from passphrase via PBKDF2 with different salt than encryption key; server cannot link vault to passphrase |
| XSS via malicious feed content | All HTML sanitized through DOMPurify; Content Security Policy headers restrict script/style sources |
| Malicious feed URLs (SSRF) | Proxy blocks localhost, private IPs (10.x, 172.16-31.x, 192.168.x), link-local (169.254.x), and AWS metadata endpoint |
| Passphrase theft from localStorage | Raw passphrase never persisted — only derived JWK key material stored. Stolen keys cannot be used to recover the passphrase or access the vault from a different device. |
| Feed URL logging by proxy | Proxy uses POST with JSON body; URLs never appear in query strings, access logs, or CDN logs |
| User IP leaked via favicons | Favicons proxied through the CORS proxy, not loaded directly from publisher servers |
| Timing analysis of sync patterns | 0-30s random jitter added after debounce; vault payloads padded to power-of-2 bucket sizes |
| IndexedDB metadata leakage | Index fields (url, feedId, guid) are HMAC-SHA256 hashed — deterministic for queries but non-reversible |
| User-Agent fingerprinting via proxy | Fixed `User-Agent: FeedZero/1.0` on all outbound proxy requests |
| Data persistence after logout | "Delete all data" removes IndexedDB, localStorage (including derived keys), and cloud blob |

### What FeedZero does NOT protect against

| Limitation | Explanation |
|------------|-------------|
| **Proxy operator sees feed URLs** | The CORS proxy must know which URLs to fetch. A malicious or compromised proxy operator can log every feed URL you subscribe to. Self-hosting mitigates this. |
| **DNS visibility** | Your ISP/network can see DNS queries for feed domains (unless you use encrypted DNS). |
| **Feed server logs** | Feed publishers see requests from the proxy's IP, not yours. But if you use a self-hosted proxy, your IP is exposed. |
| **Stolen derived keys enable local decryption** | Derived JWK keys in localStorage can decrypt local IndexedDB data. However, they cannot recover the passphrase or access the cloud vault from another device. |
| **4-word passphrase brute-force** | 51.7 bits of entropy is strong against online attacks (rate-limited) but potentially vulnerable to offline brute-force if an attacker obtains your encrypted vault. |
| **No forward secrecy** | If your passphrase is compromised, all historical data encrypted with that passphrase is exposed. |

### Network Request Inventory

Complete list of all network requests FeedZero makes:

| Request | Trigger | Data Sent | Data Received |
|---------|---------|-----------|---------------|
| `POST /api/feed` | Adding feed, refreshing feed | `{ "url": "..." }` in body | Feed XML/JSON |
| `POST /api/page` | "Extract full text" button | `{ "url": "..." }` in body | Page HTML |
| `POST /api/feed` (favicon) | Displaying feed favicon | `{ "url": "https://example.com/favicon.ico" }` | Icon image |
| `HEAD /api/sync?vaultId=<id>` | Checking if cloud vault exists | Vault ID | 200/404 status |
| `GET /api/sync?vaultId=<id>` | Pulling cloud data | Vault ID | Encrypted blob |
| `PUT /api/sync?vaultId=<id>` | Pushing local data to cloud | Vault ID, encrypted blob (padded to power-of-2 size) | Success/error |
| `DELETE /api/sync?vaultId=<id>` | Deleting cloud data | Vault ID | Success/error |

**No other network requests are made.** There is no analytics, no telemetry, no crash reporting, no third-party tracking.

### Cryptographic Details

**Local storage encryption:**
- Algorithm: AES-GCM with 256-bit key
- IV: 12 bytes, randomly generated per encryption operation
- Key derivation: PBKDF2 with SHA-256, 100,000 iterations
- Index hashing: HMAC-SHA256 with a dedicated key (derived from passphrase with separate salt)

**Cloud sync encryption:**

```
                    User Passphrase (4 words, ~51.7 bits entropy)
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
            ┌──────────────┐                ┌──────────────┐
            │ PBKDF2       │                │ PBKDF2       │
            │ salt: "vault-│                │ salt: "vault-│
            │ id-derivation│                │ key-derivat- │
            │ -salt-v1"    │                │ ion-salt-v1" │
            │ iterations:  │                │ iterations:  │
            │ 100,000      │                │ 100,000      │
            └──────┬───────┘                └──────┬───────┘
                   │                               │
                   ▼                               ▼
            ┌──────────────┐                ┌──────────────┐
            │ Vault ID     │                │ Encryption   │
            │ (32 bytes,   │                │ Key          │
            │ hex-encoded) │                │ (256-bit AES)│
            └──────────────┘                └──────────────┘
```

| Property | Value |
|----------|-------|
| Passphrase entropy | ~51.7 bits (4 words from EFF large wordlist, 7776 words) |
| Key derivation | PBKDF2-SHA256, 100,000 iterations |
| Encryption | AES-GCM-256 |
| IV length | 12 bytes (96 bits), random per encryption |
| Vault ID length | 32 bytes (256 bits), hex-encoded to 64 chars |

The server never receives the passphrase or encryption key. It only sees the vault ID and encrypted blob.

### localStorage Contents

| Key | Value | Purpose |
|-----|-------|---------|
| `feedzero:onboarding-complete` | `"true"` or absent | Tracks if user completed onboarding |
| `feedzero:derived-keys` | JSON with JWK key material | Derived cryptographic keys (DB key, HMAC key, optionally vault key + vault ID) |
| `feedzero:sync-status` | `"local-only"` / `"synced"` | Current sync mode |

**Why store derived keys?** On page load, the app needs cryptographic keys to open the database. Storing pre-derived JWK keys avoids re-deriving from the passphrase (which is never persisted). Stolen keys can decrypt local data but cannot recover the passphrase or access the cloud vault from another device. Legacy users with stored passphrases are auto-migrated on first load.

### Third-Party Dependencies (Runtime)

| Dependency | Purpose | Privacy Notes |
|------------|---------|---------------|
| React, ReactDOM | UI framework | No network calls |
| Zustand | State management | No network calls |
| Dexie | IndexedDB wrapper | Local storage only |
| DOMPurify | HTML sanitization | Local processing only |
| Defuddle | Full-text extraction | Local processing only |
| marked | Markdown parsing | Local processing only |
| Radix UI | Accessible UI primitives | No network calls |
| lucide-react | Icons | No network calls, bundled SVGs |

### Honest Caveats

1. **The proxy is a trust point.** If you don't trust the proxy operator, they can log your feed subscriptions. Self-hosting the proxy shifts trust to your own infrastructure.

2. **Derived keys in localStorage.** JWK key material is stored in localStorage. A malicious browser extension or same-origin XSS could steal the keys and decrypt local IndexedDB data. However, stolen keys cannot recover the passphrase or access the cloud vault from another device.

3. **4-word passphrases are not uncrackable.** 51.7 bits of entropy is strong against online attacks (rate-limited) but potentially vulnerable to offline brute-force if an attacker obtains your encrypted vault.

4. **No forward secrecy.** If your passphrase is compromised, all historical data encrypted with that passphrase is exposed.

5. **Sync is all-or-nothing.** The entire vault is uploaded/downloaded on each sync. There's no differential sync or conflict resolution beyond last-write-wins.

### Recommendations for High-Risk Users

- **Self-host the proxy** to eliminate third-party URL logging
- **Use a longer passphrase** (6+ words) for sync
- **Use encrypted DNS** (DoH/DoT) to hide feed domain lookups from your ISP
- **Use "Delete all data"** when leaving shared computers (removes IndexedDB, localStorage keys, and cloud vault)
- **Disable cloud sync** if you don't need cross-device access

### Source Verification

All claims in this document can be verified by reading the source code:

| Claim | Source File |
|-------|-------------|
| SSRF protection | `src/core/proxy/validate-url.ts`, `src/core/proxy/proxy-handler.ts` |
| AES-GCM encryption | `src/core/storage/crypto.ts` |
| HMAC-SHA256 index hashing | `src/core/storage/crypto.ts` (`hmacHash`), `src/core/storage/db.ts` |
| Key derivation & JWK storage | `src/core/storage/key-material.ts` |
| PBKDF2 vault parameters | `src/core/sync/vault-crypto.ts` |
| Passphrase generation | `src/core/crypto/passphrase-generator.ts` |
| DOMPurify sanitization | `src/core/parser/sanitizer.ts` |
| CSP headers | `vercel.json`, `server.ts` |
| Favicon proxying | `src/components/feeds/feed-favicon.tsx` |
| Sync timing jitter | `src/stores/sync-store.ts` (`scheduleSyncPush`) |
| Payload padding | `src/core/sync/sync-service.ts` |
| Normalized User-Agent | `src/core/proxy/proxy-handler.ts` |
| Sync handler | `src/core/sync/sync-handler.ts`, `api/sync.ts` |
| IndexedDB schema | `src/core/storage/db.ts` |
