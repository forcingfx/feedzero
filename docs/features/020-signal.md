# Feature 020: Signal

## Status
Implemented

## Summary

Signal surfaces the topics emerging across the user's feeds — "what's loud
right now" — derived entirely from local cross-feed term frequency. No
LLM, no model download, no third-party call. Phase 1 is a plain-text
ranked list (no cards, no images, no magazine layout) accessible at
`/signal` from a Sparkles entry in the sidebar. Tier: Personal+.

Gating: the feature unlocks once the user has ≥100 articles in their
local store. Below the gate, the page renders a progress tile ("X / 100
articles · Signal needs noise to filter — come back at 100."). Above
it, the engine runs on the smallest recency window (7d → 14d → 30d →
all) that contains at least 50 articles.

## Behaviour

```gherkin
Feature: Signal — cross-feed topic surface

  Scenario: Sub-gate
    Given my local article store contains 47 articles
    When I navigate to /signal
    Then I see a locked tile titled "Signal"
    And the tile shows "47 / 100" with a progress bar
    And the copy reads "Signal needs noise to filter — come back at 100."

  Scenario: Unlocked, with cross-feed signal
    Given my local article store contains ≥100 articles
    And the engine finds terms appearing in ≥2 articles across ≥2 feeds
    When I navigate to /signal
    Then I see a header "Signal · <window> · N articles · M feeds"
    And up to 10 topic blocks ranked by cross-feed signal strength
    And each block shows a muted-uppercase term chip plus a count line
    And under it up to 6 article rows (title — feed · relative time)
    When I click an article
    Then I am navigated to /feeds/:feedId/articles/:articleId

  Scenario: Unlocked, no cross-feed signal
    Given my local article store contains ≥100 articles
    And every distinctive term lives in only one feed
    When I navigate to /signal
    Then I see the header bar with window + counts
    And one line reading "No clear signal in your feeds right now."

  Scenario: Refresh
    Given a previously generated report sits in localStorage
    When I click "Refresh"
    Then the engine recomputes against the current corpus
    And the report's generatedAt timestamp advances
```

## Architecture

### Flow

1. `SignalPage` mounts. Its `useEffect` calls `useSignalStore.loadReport()`
   on mount and whenever the total article count changes (so adding feeds
   or refreshing flips the locked → ready transition without a reload).
2. `loadReport()` collects every article from `useArticleStore` and
   counts them. If `count < SIGNAL_CORPUS_GATE` (100) it sets status
   `"locked"` and returns. The page renders the locked tile.
3. Otherwise it consults the localStorage cache
   (`feedzero:signal-report`). A cached report is reused when (a) it is
   fresher than 24h, (b) its `corpusSize` differs from the current
   count by < 10%, and (c) `pickWindow()` on the current corpus would
   pick the same window the cache used. Failing any check, it
   recomputes.
4. On recompute the store flips to `"loading"`, hands off via a
   microtask so subscribers see the loading frame, and calls
   `generateReport()`:
   1. **Window pick:** try 7d → 14d → 30d → all; stop at first window
      with ≥ `SIGNAL_MIN_PER_WINDOW` (50) articles.
   2. **Dedupe** by normalized title hash (lowercase, strip punctuation)
      — syndicated copies of the same story would otherwise inflate
      every term equally.
   3. **Tokenize** title + plain-text body with `tokenize.ts`: HTML
      stripped, lowercased, English stopwords + feed-noise terms
      dropped, numeric-only and <3-char tokens dropped, light suffix
      stripping with double-consonant collapse for `-ing`/`-ed`.
   4. **Index** per term: distinct article ids (DF) and distinct feed
      ids (FF).
   5. **Score** `signal(t) = distinctArticles(t) * log(1 + distinctFeeds(t))`.
      Drop terms with <2 articles OR <2 feeds.
   6. **Greedy cluster:** sort by signal desc, term asc. For each term,
      claim unclaimed articles containing it, capped at
      `ceil(corpus / 10) + 5`. **Bleed-over guard:** if <50% of the
      term's original articles survive prior claims, skip — it's just a
      fragment of a stronger cluster (e.g. "ship" after "openai" eats
      every "OpenAI ships X" headline).
   7. Order articles within each topic by recency desc.
   8. `pickDisplayTerm` recovers the most common original casing from
      the articles actually assigned to the cluster (`openai` → `OpenAI`).
5. The store writes the report to localStorage and sets status
   `"ready"`. The page renders topic blocks. Topic terms missing from
   the result render as `topics: []` and the empty-but-ready caption.
6. Article click navigates to the existing reader route. The article is
   already in `useArticleStore`, so the reader page renders without an
   additional DB read.

### Files

| File | Role |
|------|------|
| `src/pages/signal-page.tsx` | The page. Three render branches (locked / empty / ready), Refresh button, topic blocks, article rows. |
| `src/stores/signal-store.ts` | Zustand store. `loadReport({ force? })`, status state machine, 24h localStorage cache with window + corpus-drift invalidation. |
| `src/core/signal/types.ts` | `Topic`, `SignalReport`, `WindowChoice` plus the gate / target / TTL constants. |
| `src/core/signal/tokenize.ts` | `tokenize()`, `lightStem()`, English `STOPWORDS`, `FEED_NOISE` set. |
| `src/core/signal/frequency-engine.ts` | `generateReport()` + `pickWindow()` (exported so the store can detect cache staleness without rerunning the full engine). Internal helpers: `dedupeByTitle`, `buildIndex`, `scoreTerms`, `clusterGreedy`, `pickDisplayTerm`. |
| `src/lib/format-relative.ts` | Newspaper-style relative date label ("5m ago", "yesterday", "Mon 15"). |
| `src/components/layout/sidebar-body.tsx` | Sparkles "Signal" entry between Explore and All items. |
| `src/app.tsx` | `<Route path="/signal" element={<SignalRoute />} />`, lazy-loaded. |
| `src/core/features/tier-matrix.ts` | `signal` entry — Personal+, shipped. |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/signal/tokenize.test.ts` | HTML strip, lowercase, stopword/feed-noise drop, light stemming with double-consonant collapse. |
| `tests/core/signal/frequency-engine.test.ts` | Happy path: 60 articles across 8 feeds → topics ordered by signal, single-feed terms dropped, disjoint topics, intra-topic recency order, displayTerm casing. |
| `tests/core/signal/frequency-engine-window.test.ts` | Adaptive window picks the smallest with ≥50 articles, falls back to "all" when every window is sparse. |
| `tests/core/signal/frequency-engine-edge.test.ts` | Title-hash dedupe, single-feed corpus → empty topics, body-token fallback when title is uninformative, deterministic across input order, non-English content does not crash, dominant-term cap. |
| `tests/stores/signal-store.test.ts` | Locked / loading / ready transitions, empty-ready handling, cache TTL hit, force-reload bypasses cache, window change invalidates cache, ±10% corpus drift invalidates cache, persistence across state reset. |
| `tests/pages/signal-page.test.tsx` | Locked tile shows progress, empty-ready message, topic headers + article rows render, Refresh re-runs the engine, article click navigates to the reader, cache priming reads from localStorage. |
| `tests/e2e/signal.spec.ts` | Sidebar Sparkles entry navigates to `/signal`, locked tile renders with the gate copy when the corpus is empty. |
| `tests/core/features/tier-matrix.test.ts` | `signal` is shipped, Personal+ available, Free unavailable; round-trips through `GATED_FEATURE_IDS`. |

## Design Decisions

- **Algorithmic before LLM.** Phase 1 is pure-TS frequency analysis.
  Local LLMs in the browser cost 50MB+ downloads and add a third-party
  surface; the value of summarization is small compared to the
  ranking-and-clustering work, which is fully expressible in standard
  algorithms. Phase 2 can layer in a local summarizer if there is real
  demand.
- **Honor-system tier gating, Personal+.** Local algorithmic compute
  has no per-user cost, so there is no operational reason to reserve it
  for Pro. Personal is the right tier — it differentiates the paid
  product without metering anything. Self-hosters bypass via
  `VITE_SELF_HOSTED=1`. See ADR 012. The gate is enforced on the page:
  `SignalPage` calls `useFeatureGate("signal")` and renders an
  `UpgradeSplash` (with a "Upgrade to Personal" CTA → the subscription
  settings tab) when `!gate.enabled && gate.reason === "tier-locked"`.
  The engine is skipped entirely while gate-locked. The gate passes
  through for `paid-tier-inactive` (pre-launch builds) and
  `self-hosted-bypass`, so today — before the paid tier launches —
  every user reaches the feature; the gate only bites once
  `VITE_PAID_TIER_VISIBLE=1`. The sidebar entry stays visible
  regardless (discoverability).
- **Cross-feed diversity is the signal.** Score = `articles × log(1 + feeds)`.
  Multiplying by log-feeds means a story appearing in 10 outlets
  outranks one outlet posting 10 times, which matches the
  user's intuition for "what's everyone talking about". The log keeps
  the boost gentle so a 3-feed story doesn't get crushed by a 6-feed one.
- **Greedy clustering with bleed-over guard.** Greedy is interpretable
  and deterministic. The guard (cluster needs ≥50% of its term's
  original articles to survive prior claims) catches near-duplicate
  clusters that would otherwise emerge — e.g. "ship" forming a second
  cluster from leftover "OpenAI ships X" articles after "openai" took
  most of them.
- **No Worker for v1.** Engine measured <100ms at 1k articles in unit
  tests. If real corpora push beyond 250ms we gate behind
  `requestIdleCallback` first; only move to a Worker if that's still
  insufficient.
- **24h cache with window + corpus invalidation.** Frequency is cheap
  to recompute but caching keeps revisits within a day instant. The
  cache invalidates when the corpus shifts by ≥10% (the user added a
  meaningful batch of articles) or when the chosen window would
  change (recent days went quiet / a new batch landed in the recent
  window). Stale-by-time bumps to a recompute after 24h.

## Limitations

- **English-only.** Stopwords are English; tokenize uses `\W+` which
  handles ASCII word boundaries cleanly but collapses CJK/RTL text into
  long single tokens. The engine produces *something* on non-English
  content (test asserts no-crash) but the rankings are low-quality. A
  language-detection pre-pass + per-language stopword sets is the
  Phase 2 fix.
- **No topic mute / personalisation.** A user who follows 20 AI feeds
  will see AI dominate Signal every day. The greedy cap limits the
  page from being all-AI, but there's no "mute this topic" affordance.
  Add when there's a concrete user request.
- **No topic trend.** The page shows current signal, not "signal
  emerging vs signal cooling". A sparkline over the last N days per
  topic is a natural Phase 2 add.
- **No summarization.** Topics show their member articles' titles, not
  a synthesised brief. Phase 2 can layer a local transformer
  summarizer (opt-in due to the model download cost).
- **No RSS export of a topic.** Power users may want to subscribe to
  "everything in the OpenAI topic"; not built.
- **Sidebar entry is always visible** — by design, for discoverability
  (matches the `filters` / `auto-organize` pattern). The tier gate lives
  on the page, not the sidebar.
