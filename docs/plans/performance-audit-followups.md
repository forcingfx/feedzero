# Plan: Performance Audit Follow-Ups

Items from the 2026-05 performance audit ([first PR](https://github.com/forcingfx/feedzero/pull/170), [second PR](https://github.com/forcingfx/feedzero/pull/171)) that landed neither, plus opportunities the audit surfaced along the way. Listed in rough priority order.

## 1. Paginate articles, lazy-decrypt content

**Single biggest RAM win available.** `article-store.preloadAll()` calls `getAllArticles()` at boot, which decrypts every article in IndexedDB and holds the full content in `articlesByFeedId`. For a 5,000-article library this is 5–50 MB of decrypted content sitting in memory before the user has done anything.

### What

Store article *metadata* (`id`, `feedId`, `guid`, `title`, `summary`, `publishedAt`, `read`, `starred`, `muted`, `folderId`, `extractedAt`) in the in-memory store. Decrypt full `content` on demand — only when the user selects an article or a feature explicitly needs it.

### Why it's blocked

Two callers iterate `articlesByFeedId` reading `article.content` today:

1. **Smart-filter `body matches` predicate** — `src/core/filters/evaluator.ts` evaluates filters across every loaded article on render of the filter view. With metadata-only state, every evaluation would need to bulk-decrypt content.
2. **Signal engine term frequency** — `src/core/signal/frequency-engine.ts` tokenizes article bodies (`content` + `summary`) to build the cross-feed term frequency. The corpus gate is 100 articles minimum; the engine assumes content is in memory.

Either we (a) bulk-decrypt on demand for these predicates (slow on first eval, cacheable), or (b) pre-compute at ingest time (signal: store the token bag; smart-filter: pre-evaluate against every saved filter and persist the match list).

### Approach

Recommend (b) for signal — `frequency-engine.ts` is the dominant content reader and a stored token bag is much smaller than raw HTML. Recommend (a) for smart filters — body-match filters are uncommon enough that on-demand decryption is acceptable.

Schema-level change. Storage table additions:

- `articles_meta`: encrypted metadata-only record per article (typical 200–500 B vs current 2–5 KB).
- `articles_content`: encrypted body, keyed by article id (existing payload, possibly renamed).
- `articles_tokens` (signal): pre-computed token bag, encrypted, populated at ingest.

Migration: on first boot after the upgrade, iterate existing encrypted articles, derive metadata + tokens, write the new tables, leave the old `articles` table as the content store (or rename in a second migration). Honor the **key-data coupling invariant** (CLAUDE.md) — `assertKeyDataCoupling()` must still pass after every step.

Touch list:
- `src/core/storage/db.ts` (new tables, `getAllArticleMetadata`, `getArticleContent`)
- `src/types/index.ts` (`ArticleMetadata` type)
- `src/stores/article-store.ts` (`preloadAll` → loads metadata only; `selectArticle` → fetches content)
- `src/core/signal/frequency-engine.ts` (read from stored tokens)
- `src/core/filters/evaluator.ts` (lazy-decrypt path for `body matches`)
- `src/core/sync/sync-service.ts` (`exportVault`/`importVault` — vault stays the same; sync still ships content)

### Verification gate

Per the original audit plan: full RGR + an integration smoke that the sidebar unread counts, the Signal report, and every smart-filter view produce identical results pre/post against a 1,000-article fixture.

**Estimated effort**: 6–8 h. Deserves its own dedicated PR.

---

## 2. Drop the redundant `articles[]` slice from `article-store`

Cleanup that pairs with item 1. The store currently keeps both `articlesByFeedId` (source of truth) and a duplicated `articles` (visible slice). Removing the duplicate saves ~250 KB – 1 MB depending on visible list size and eliminates a class of "the two got out of sync" bugs.

### Why it's blocked

Four consumers read `state.articles`:
- `src/components/articles/article-list.tsx`
- `src/pages/feeds-route.tsx`
- `markAllAsRead` and `markAsRead` inside `article-store` use `get().articles` to find the affected items.

Replacement: a `useVisibleArticles(feedId, sortMode, showMuted)` hook that derives + `useMemo`s. Internal mutators get a `getVisibleArticlesForCurrentView()` helper. The derivation logic already exists in `deriveVisibleArticles` — that function just stops being driven by `loadArticles`/`setShowMuted`/`setArticleSortMode` writing into `articles`.

### Approach

Land this **alongside** item 1, not before. The pagination work touches the same callsites; splitting the work creates a rebase tax.

**Estimated effort**: 3 h after item 1 lands. Same PR.

---

## 3. Fix the remaining ineffective dynamic imports

`vite build` flagged five additional `INEFFECTIVE_DYNAMIC_IMPORT` warnings after the `prefetch-service.ts` fix (commit `f0e918b` on the first PR). Each one means a module that was supposed to be lazy-loaded ends up in the eager bundle because some other path imports it statically.

### Affected modules

- `src/core/storage/crypto.ts` — dynamically imported by `db.ts` but statically imported by `db.ts` (different code path), `key-manager.ts`, `vault-crypto.ts`.
- `src/stores/sync-store.ts` — dynamically imported by `preferences-store.ts` but statically imported by `app.tsx`, `device-setup-wizard.tsx`, `app-sidebar.tsx`, etc.
- `src/stores/preferences-store.ts` — same pattern (dynamic from `persist-preferences.ts` / `sync-store.ts`; static from `app-store.ts`).
- `src/stores/app-store.ts` — dynamic from `preferences-store.ts` / `sync-store.ts`; static from `app.tsx`, several components.
- `src/stores/license-store.ts` — dynamic from `sync-store.ts`; static from `app.tsx`, several billing/settings components.
- `src/stores/article-store.ts` — dynamic from four stores; static from `app.tsx` + a dozen components.
- `src/stores/feed-store.ts` — dynamic from three stores; static from `app.tsx` + a dozen components.

### Why

Each of these is a store imported both eagerly (for first-paint UI) and lazily (for circular-dependency avoidance). Vite can't honor the dynamic-import boundary when ANY path is static — the whole module ends up in the eager chunk.

### Approach

For each pair, decide: is the eager import actually needed, or is the dynamic import the right shape? Most of the dynamic imports look like they're trying to break import cycles between stores; the right fix is usually to extract the shared piece into a third module that both stores import directly.

This is several small commits, not one big one. Each commit fixes one cycle and verifies the resulting bundle.

**Estimated effort**: 2–3 h per cycle, 5–7 cycles. Could be a single PR with one commit per cycle.

---

## 4. Narrow Zustand subscriptions in hot list components

The audit recommended targeting "the top 5 re-render offenders found via React DevTools profiler." Without that profiler data, every narrowing is a guess.

### What's actually broken

`useFeedStore((s) => s.feeds)` returns the entire `feeds` array reference. Any feed mutation (rename, folder change, refresh) creates a new array — so every component subscribed to `s.feeds` re-renders. There are 15+ such subscribers in the current codebase.

### Why narrowing the selector alone doesn't help

Zustand uses `Object.is` on the returned value. `(s) => s.feeds` and `(s) => s.feeds.find((f) => f.id === x)` both create new references on every store update if the store re-builds `feeds` immutably (which it does on every mutation).

### Real fix options

- **Per-feed selectors**: extract a `useFeedById(id)` hook whose selector calls `feeds.find(...)`. Subscribers re-render only when *that* feed mutates because the find result is reference-stable.
- **`feedsVersion` counter**: a numeric counter incremented on every mutation. Components that need invalidation but don't need the array subscribe to the counter; components that need the array still subscribe to `feeds`.
- **Split the store**: separate slices for `metadata` (rare-mutation) vs `freshness` (frequent-mutation per refresh). Most subscribers only care about metadata.

### Prereq

Get real profiler data — `npm run dev`, React DevTools profiler, capture an actual session with sidebar interactions and a refresh cycle. Without this, the work is premature optimization risk-on with no measurement upside.

**Estimated effort**: 4 h after profiler data identifies the top 5 offenders. Could be a small PR per offender.

---

## 5. Pre-compile `server.ts` to JS, drop `tsx` from runtime deps

`tsx` lives in `dependencies` (not `devDependencies`) because `npm run serve` in the self-host Docker image runs `node --import tsx server.ts` to load TypeScript at runtime. The Docker runtime stage uses `npm ci --omit=dev`, so `tsx` has to be a runtime dep — confirmed in `Dockerfile:38–41`.

### What

Add a build step that compiles `server.ts` (and its imported `src/core/` graph) to JS. Docker runs `node server.js` instead of `node --import tsx server.ts`. `tsx` becomes a devDependency.

### Why

- Smaller production install for self-hosters (~3 MB).
- Cleaner separation: `dependencies` becomes "runtime-only", `devDependencies` becomes "build + dev".
- Sets up future work: with `server.ts` compiled, the `external: ["stripe", "@upstash/redis", ...]` rule could move from the SPA build to the server build, ensuring server-only deps are *only* in the API/server bundles.

### Approach

Extend `scripts/build-api.js` (or add a new `scripts/build-server.js`) to emit `dist/server.js` via esbuild. Update `package.json` `serve` script: `node dist/server.js`. Update `Dockerfile` to run `npm run build:all` (which already includes the API build) and ship `dist/` instead of `src/` + `server.ts` + `tsconfig.json`. Move `tsx` to `devDependencies`.

**Estimated effort**: 2 h. Independent commit/PR.

---

## 6. Pre-tokenize signal corpus at ingest

Tangent to item 1, worth its own treatment. `frequency-engine.ts` re-tokenizes every article body on every `loadReport` call. The corpus gate is 100 articles, but real-world Personal-tier users have thousands.

### What

At article ingest (in `feed-service.refreshFeed` after `addArticles`), tokenize the body once and store the token bag encrypted as a sibling field. The Signal engine reads tokens instead of re-tokenizing.

### Why

- Signal `loadReport` becomes `O(n)` token-bag merge instead of `O(n × len(body))` tokenize-then-merge.
- Per-article CPU spent once at ingest (when we're already doing I/O) instead of on every Signal page open.
- Enables item 1: pre-stored tokens mean the Signal engine doesn't need access to `content`.

### Approach

- Add `tokens?: string[]` field to `Article` (or a separate encrypted table `article_tokens` for cleanliness).
- Backfill at first-boot-after-upgrade via a migration similar to the one needed for item 1.
- `frequency-engine.ts` reads `article.tokens` instead of calling `tokenize(article.content + " " + article.summary)`.

**Estimated effort**: 4 h, ideally paired with item 1 so they share a migration step.

---

## Skip list

Things the original audit considered but that don't merit follow-up:

- **`marked` removal**: investigated during the first PR — `marked` is the only path that converts GitHub READMEs to HTML, not redundant. Already dynamically imported via the `vendor-extractor` lazy chunk; no win available.
- **Persist favicon resolutions in IndexedDB**: the better fix turned out to be removing the explicit `Cache-Control: no-cache` on the favicon handler (commit `4c7c6f4` on the second PR). The browser HTTP cache now does what IndexedDB persistence would have done, with no client code.
- **`tsx` in devDependencies**: confirmed runtime-required for Docker self-host (see item 5 for the real fix).
- **EFF wordlist lazy-load**: already implemented before the audit (62 KB chunk emitted at `dist/assets/eff-wordlist-*.js`).
