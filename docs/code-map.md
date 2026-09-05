# Code Map — where things live

File-level index of FeedZero's modules, stores, components, routes, hooks, styling, and types. This is the "where does X live / what's its API" reference that used to sit inline in `CLAUDE.md`; it was moved here because it's situational lookup, not a standing rule. The always-true *rules* about these layers (core returns `Result` and imports no UI, URL is the source of truth for navigation, stable outer panel topology per ADR 013, etc.) stay in `CLAUDE.md` → Key Patterns. Conceptual diagrams (dependency graph, data flow, threat model) live in [architecture.md](architecture.md).

## Core Modules (Framework-Agnostic)

`src/core/` and `src/utils/` are framework-agnostic TypeScript with zero React/UI imports — the shared backend.

- **src/utils/result.ts** — `Result<T>` (`ok`/`err`) instead of throwing. `andThen` chains; `fromPromise` wraps async.
- **src/utils/constants.ts** — DB name, crypto params, `LOCAL_STORAGE` keys, default passphrase.
- **src/core/storage/crypto.ts** — PBKDF2 + AES-GCM + HMAC-SHA256 via Web Crypto.
- **src/core/crypto/argon2.ts** — Argon2id via `hash-wasm`; memory-hard KDF for new sync vaults so a 4-word passphrase (~51.7 bits) resists GPU brute-force. Prod params 64 MiB / t=3 / p=1 (OWASP). Vault envelope stamps the deriving KDF (`KdfSpec` in `sync/types.ts`) so recovery picks the match. Legacy PBKDF2 vaults auto-upgrade on first passphrase entry (→ `upgradeVaultKdf`).
- **src/core/storage/db.ts** — Dexie. Content AES-GCM encrypted; index fields (url, feedId, guid) HMAC-SHA256 hashed so we query without exposing plaintext. Call `open(passphrase)` or `openWithKeys(dbKeyJwk, hmacKeyJwk)` first.
- **src/core/storage/key-material.ts** — `deriveAndStoreKeys` / `loadStoredKeys` / `clearStoredKeys`: derives DB/HMAC/optional vault keys, persists JWK to localStorage. Raw passphrase never persisted.
- **src/core/storage/schema.ts** — `createFeed()` / `createArticle()` factories returning `Result`.
- **src/core/discovery/** — `discoverFeed(url)` multi-strategy cascade; pure functions in `strategies.ts`.
- **src/core/crypto/passphrase-generator.ts** — EFF large wordlist, 4 words, ~51.7 bits.
- **src/core/proxy/validate-url.ts** — SSRF-safe URL validation. Returns `Result<URL>`.
- **src/core/proxy/proxy-handler.ts** — Shared proxy logic for serverless functions.
- **src/core/extractor/extractor.ts** — `extract(html, url)` + `needsExtraction(article)`. Swap impl by changing the import.
- **src/core/extractor/{defuddle-extractor,cleanup,markdown}.ts** — Defuddle impl; HTML cleanup; markdown→HTML via marked + DOMPurify.
- **src/core/extractor/adapters/** — `SiteAdapter` interface, `AdapterRegistry` (O(1) domain lookup). `github-adapter` extracts README; `default-adapter` uses Defuddle.
- **src/core/sync/types.ts** — `VaultData`, `EncryptedVault`, `SyncStorageAdapter`.
- **src/core/sync/vault-crypto.ts** — `deriveVaultId` (PBKDF2, KDF-invariant by design — vault ID is a routing identifier, not a secret); `deriveVaultKey` (dispatches on `KdfSpec`); `encryptVault` (stamps the spec so recovery finds the matching KDF) / `decryptVault`. `DEFAULT_NEW_VAULT_KDF` Argon2id in prod, cheap under Vitest.
- **src/core/sync/sync-service.ts** — Client orchestrator: `exportVault`, `importVault`, `pushVault`, `pullVault`.
- **src/core/sync/sync-handler.ts** — Shared server `Request → Response`: GET (pull) / PUT (push) / DELETE.
- **src/core/sync/adapters/** — `memory`, `filesystem`, `vercel-blob`, `resolve-adapter`.
- **src/core/feeds/feed-service.ts** — `addFeedFlow(url)`, `refreshFeed`, `refreshAllFeeds` (guid dedup).
- **src/core/signal/frequency-engine.ts** — `generateReport(articles, ctx, now)` + `pickWindow()`. Pure-TS cross-feed term frequency, greedy clustering, bleed-over guard. No LLM, no Worker. Drives `/signal`.
- **src/core/signal/tokenize.ts** — `tokenize()` + `lightStem()`, English stopwords + feed-noise lists.
- **src/core/parser/parser.ts** — `parse(text, feedUrl)` via feedsmith (RSS 2.0, Atom 1.0, JSON Feed 1.1).
- **src/core/parser/sanitizer.ts** — DOMPurify wrapper, allowlisted tags/attrs.
- **src/core/opml/** — `opml-service.ts` (import/export via feedsmith), `url-list-parser.ts`.
- **src/core/feedback/feedback-handler.ts** — Creates GitHub issues via REST. Needs `GITHUB_FEEDBACK_TOKEN` (fine-grained PAT, `issues: write`) + `GITHUB_REPO`.
- **src/core/sync/sync-stats-handler.ts** — Vault count stats; no PII.

## Zustand Stores

Stores call core modules directly; components subscribe to slices.

- **app-store** — DB init, global error, onboarding. `initialize(passphrase)`, `checkOnboardingStatus()`, `initializeReturningUser()` (detect mode, open DB, optionally pull sync).
- **feed-store** — `feeds[]`, `selectedFeedId`, CRUD. `refreshAll()` pulls the sync vault first so other-device feeds materialize.
- **article-store** — `articles[]`, `selectedArticle`, `loadArticles`, `selectArticle` (auto-marks read).
- **extraction-store** — `cache` (link → HTML), `viewMode`, `fetchExtracted(url)`.
- **onboarding-store** — State machine: `welcome` → `storage-choice` → `passphrase-display` → `passphrase-confirm` → `initializing` (or `recovery`). Modes: `local` (skips confirm) vs `sync` (requires confirm).
- **sync-store** — Status `local-only | syncing | synced | error`. `credentials: SyncCredentials | null` (pre-derived vault ID + CryptoKey; never raw passphrase). Actions: `enableSync` (derives + pushes), `restoreSync`, `push`, `pull`, `scheduleSyncPush` (5s debounce + 0–30s jitter), `disableSync` (deletes server vault + clears keys), `logout` (clears local data + resets onboarding; preserves cloud vault).
- **import-store** — OPML/URL-list progress. `idle → importing → complete | error`.
- **signal-store** — `/signal` state. Status `idle | locked | loading | ready | error`. `loadReport({ force? })` runs the local engine if corpus ≥ `SIGNAL_CORPUS_GATE` (100). 24h localStorage cache (`feedzero:signal-report`) invalidated when the window changes or corpus shifts ≥10%.

## React Components

- **src/components/ui/** — shadcn/ui wrappers over Radix. Primitives.
- **src/components/layout/** — header, panel.
- **src/components/feeds/**, **articles/**, **reader/** — list/item/reader per domain.
- **src/components/onboarding/** — `onboarding-modal.tsx` + steps under `steps/`.
- **src/components/explore/**, **feedback/**, **settings/** — feature UIs.
- **src/components/sync/** — `sync-setup-dialog.tsx` (enable/disable, data mgmt, vault deletion), `sync-status-chip.tsx` (amber local / green synced / red error).
- **src/pages/feeds-page.tsx** — Desktop: two-tier `ResizablePanelGroup`. Outer `[sidebar | stage]` is constant on every route — the only place sidebar width lives. The `stage` panel's *content* varies per route: `<ExploreCatalog>` (`/explore` / empty feeds), `<StatsPage>` (`/stats`), or an inner `ResizablePanelGroup` `[article-list | reader]` (default). New feature areas mount inside the stage; they MUST NOT add siblings to the sidebar (that caused per-navigation resize — ADR 013). Mobile: single panel + back nav. Syncs URL params → Zustand.
- **src/lib/content-modes.ts** — Pure view-mode logic for reader-panel.
- **src/lib/decode-entities.ts** — HTML entity decoding for plain-text display.

## Routing

```
/feeds                                → Feed list (mobile: full screen)
/feeds/:feedId                        → Article list (mobile: full screen; desktop: panels 1+2)
/feeds/:feedId/articles/:articleId    → Reader (mobile: full screen; desktop: all 3 panels)
/signal                               → Cross-feed topic frequency (paid tier, gated at 100-article corpus)
```

URL is the source of truth for navigation. `FeedsPage` syncs URL params → Zustand.

## Hooks

- **use-keyboard-nav** — Article nav `j`/`k` (clicks DOM elements — same path as mouse). Feed nav `u`/`i`. Actions: `o` open original, `e` toggle view, `n` add feed (custom event), `[` toggle sidebar, `r` refresh. Disabled in input/textarea/contenteditable.
- **use-media-query / use-mobile** — `useIsDesktop()` ≥1024px; `useIsMobile()` <768px.
- **use-auto-refresh** — Background `refreshAll()` on the `AUTO_REFRESH_INTERVAL_MS` (30 min) timer + focus-when-stale trigger. Reads the store via `getState()` so it subscribes once; mounted in `AppLayout`. Staleness vs `feed-store.lastRefreshAllAt`.
- **use-license-refresh** — Same shape, for license re-verification: daily `LICENSE_RECHECK_INTERVAL_MS` (24h) timer + focus-when-stale calling `license-store.refresh()`. Closes the gap where a long-open tab keeps a revoked subscription's paid tier all session. Staleness vs `license-store.lastCheckedAt`, which `refresh()` stamps only on a *definitive* resolution (no-token, 200, 4xx) — transient 5xx/network leaves it stale so focus retries promptly. Mounted in `AppLayout`.

## Styling

Single CSS entry: `src/index.css`. Tailwind CSS v4 via `@tailwindcss/vite` (zero runtime cost).

- `@theme` — Design tokens (`--color-*`, `--font-*`).
- `@layer base` — Resets, base button/input styles. (Desktop layout is the two-tier `ResizablePanelGroup` in `feeds-page.tsx`, not a CSS grid — ADR 013.)
- `@plugin "@tailwindcss/typography"` — Required for `prose` classes in `BriefingAbstract` (model markdown: h2, ul, li, p). Without it the classes are silent no-ops and preflight strips browser defaults (bullets run together, headings inline). Locked by `tests/index-css-briefing-typography.test.ts`.
- Tailwind utilities in JSX with `cn()` from `src/lib/utils.ts`.
- **Spacing** — Use Tailwind v4's default numeric scale (`p-4`, `gap-2`). Do **not** define `--spacing-xs/sm/md/lg/xl` in `@theme` — they collide with `max-w-*` (`max-w-lg` → `--spacing-lg` not `--container-lg`). [Tailwind v4 gotcha](https://github.com/tailwindlabs/tailwindcss/discussions/17777).

## Types & Service Worker

- **src/types/index.ts** — `Feed`, `Article`, `CreateFeedInput`, `CreateArticleInput`.
- **src/workers/service-worker.js** — Excluded from coverage.
