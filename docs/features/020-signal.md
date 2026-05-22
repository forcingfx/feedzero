# Feature 020: Signal

## Status
Implemented

## Summary

Signal surfaces the topics emerging across the user's feeds — "what's loud
right now" — derived entirely from local cross-feed term frequency. No
LLM, no model download, no third-party call. It is a plain-text ranked list
(no cards, no images, no magazine layout) accessible at `/signal` from a
Sparkles entry in the sidebar. Tier: Personal+.

Topics anchor **only on proper nouns and compound nouns** ("OpenAI",
"Iran War", "Supreme Court") — never bare common nouns — detected by
capitalization consensus across the corpus (no ML). Within a topic, articles
covering the same/similar story collapse into one **story** row badged
"Covered by N outlets", expandable to each outlet's version. Each row peeks
on hover (desktop) or tap (mobile) before opening the full item in the
reader, so triage doesn't require leaving the page.

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
    And the tile shows "53 more articles to unlock" with a progress bar
    And the copy reads "47 of 100 articles in your store"

  Scenario: Unlocked, with cross-feed signal
    Given my local article store contains ≥100 articles
    And the engine finds a proper/compound noun in ≥2 articles across ≥2 feeds
    When I navigate to /signal
    Then I see a header "Signal · <window> · N articles · M feeds"
    And up to 10 topic blocks ranked by cross-feed signal strength
    And each block shows the entity in original casing plus a count line
    And under it up to 6 story rows (headline — feed · relative time)
    And a story carried by multiple feeds reads "Covered by N outlets"

  Scenario: A common noun never anchors a topic
    Given the only term shared across feeds is the common noun "tariffs"
    When I navigate to /signal
    Then no topic is anchored on "tariffs"

  Scenario: Peek then read
    Given a topic with story rows
    When I hover a row on desktop (or tap it on mobile)
    Then a preview shows the headline, source, and a teaser
    When I click the row (desktop) or "Open in reader" (mobile)
    Then I am navigated to /feeds/:feedId/articles/:articleId
    And the browser back button returns me to /signal

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
   2. **Group exact duplicates** by normalized title (lowercase, strip
      punctuation): keep a representative (most recent) per story plus a
      map of every member sharing its title, so a syndicated story is one
      representative for scoring but still knows every outlet that ran it.
   3. **Extract entities** from each representative with `entities.ts`.
      `buildLexicon` tallies corpus-wide casing to confirm proper nouns
      (capitalized in ≥70% of non-initial occurrences, or only ever seen
      capitalized and never lowercase); Title-Cased headlines are excluded
      from the casing tally. `extractEntities` then emits confirmed proper
      nouns as unigram keys and contiguous capitalized runs as compound
      keys (e.g. `iran war`). No common nouns enter the index.
   4. **Index** per entity key: distinct article ids (DF), distinct feed
      ids (FF), word count, and a casing histogram for display.
   5. **Score** `signal(t) = distinctArticles(t) * log(1 + distinctFeeds(t))
      * (1 + 0.5·(words−1))`. The phrase boost makes a compound outrank its
      constituent. Drop entities with <2 articles OR <2 feeds.
   6. **Greedy cluster:** sort by signal desc, key asc. For each entity,
      claim unclaimed representatives containing it, capped at
      `ceil(reps / 10) + 5`. **Bleed-over guard:** if <50% of the entity's
      original articles survive prior claims, skip — it's a fragment of a
      stronger cluster (e.g. `iran` after `iran war` claims its articles).
   7. **Group into stories:** within each topic, `stories.ts` merges
      representatives whose significant title tokens overlap ≥60% (Jaccard)
      and absorbs each representative's exact-duplicate members. Stories are
      ordered by outlet count desc, then recency. Member ids run most-recent
      first.
5. The store writes the report to localStorage (tagged with
   `SIGNAL_REPORT_SCHEMA_VERSION`) and sets status `"ready"`. The page
   renders topic blocks. No topics → `topics: []` and the empty-but-ready
   caption. A cached report tagged with a different schema version is
   discarded on read.
6. Each story renders via `<StoryRow>`. On desktop the headline is wrapped
   in a `HoverCard` (peek) and clicking it navigates to the reader; on
   mobile a tap opens a bottom `Sheet` preview whose "Open in reader" button
   navigates. Navigation passes `state: { from: "/signal" }`; the article is
   already in `useArticleStore`, so the reader renders without a DB read.

### Files

| File | Role |
|------|------|
| `src/pages/signal-page.tsx` | The page. Three render branches (locked / empty / ready), Refresh button, topic blocks delegating each story to `<StoryRow>`. |
| `src/stores/signal-store.ts` | Zustand store. `loadReport({ force? })`, status state machine, 24h localStorage cache with window + corpus-drift + schema-version invalidation. |
| `src/core/signal/types.ts` | `Topic`, `Story`, `SignalReport`, `WindowChoice` plus gate / target / TTL constants and the `PROPER_NOUN_RATIO` / `PHRASE_BOOST` / `STORY_SIMILARITY` / `SIGNAL_REPORT_SCHEMA_VERSION` tuning knobs. |
| `src/core/signal/tokenize.ts` | `tokenize()`, `lightStem()`, exported case-preserving `stripHtml()`, English `STOPWORDS`, `FEED_NOISE` set. |
| `src/core/signal/entities.ts` | `buildLexicon()` (proper-noun casing consensus) + `extractEntities()` (proper/compound noun keys). |
| `src/core/signal/stories.ts` | `groupIntoStories()` — fuzzy + exact same-story grouping with outlet counts. |
| `src/core/signal/frequency-engine.ts` | `generateReport()` + `pickWindow()` (exported so the store can detect cache staleness without rerunning the full engine). Internal helpers: `groupExactDuplicates`, `buildIndex`, `scoreTerms`, `clusterGreedy`. |
| `src/components/signal/story-row.tsx` | Renders a `Story`: single/multi-outlet row, hover/tap preview, expand-to-outlets. |
| `src/components/signal/article-preview.tsx` | Compact peek body (title, source, teaser, open actions). |
| `src/components/ui/hover-card.tsx` | Radix HoverCard wrapper for the desktop peek. |
| `src/lib/format-relative.ts` | Newspaper-style relative date label ("5m ago", "yesterday", "Mon 15"). |
| `src/components/layout/sidebar-body.tsx` | Sparkles "Signal" entry between Explore and All items. |
| `src/app.tsx` | `<Route path="/signal" element={<SignalRoute />} />`, lazy-loaded. |
| `src/core/features/tier-matrix.ts` | `signal` entry — Personal+, shipped. |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/signal/tokenize.test.ts` | HTML strip, lowercase, stopword/feed-noise drop, light stemming with double-consonant collapse. |
| `tests/core/signal/entities.test.ts` | Proper-noun consensus (Apple≠apple, sentence-initial-only, common-word rejection, stopword skip), compound extraction, Title-Case headline guard, possessive stripping. |
| `tests/core/signal/stories.test.ts` | Similar-headline merge, unrelated-headline split, exact-duplicate outlet counting, ordering by outlet count then recency, member recency order. |
| `tests/core/signal/frequency-engine.test.ts` | Happy path: entity-anchored topics ordered by signal, compound preferred over constituent, single-feed terms dropped, multi-outlet story surfaced, disjoint stories, displayTerm casing, schema version. |
| `tests/core/signal/frequency-engine-window.test.ts` | Adaptive window picks the smallest with ≥50 articles, falls back to "all" when every window is sparse. |
| `tests/core/signal/frequency-engine-edge.test.ts` | Common nouns never anchor a topic, syndicated story collapses to one multi-outlet story, single-feed corpus → empty, body-only entity detection, deterministic across input order, non-English does not crash, dominant-entity cap. |
| `tests/stores/signal-store.test.ts` | Locked / loading / ready transitions, empty-ready handling, cache TTL hit, force-reload bypasses cache, window change invalidates cache, ±10% corpus drift invalidates cache, persistence across state reset. |
| `tests/pages/signal-page.test.tsx` | Locked tile, empty-ready message, entity topic heading + story rows, multi-outlet badge + expand, desktop click → reader, mobile tap → preview → reader, Refresh re-runs, cache priming, schema-version invalidation. |
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
- **Entities only, by capitalization consensus.** A topic must name
  something — a proper noun ("OpenAI") or compound noun ("Iran War") — not a
  bare common noun ("tariffs"). Without an ML POS tagger, capitalization is
  the available signal: a word capitalized across the corpus's sentence-case
  bodies is a proper noun; "apple" the fruit stays lowercase, "Apple" the
  company does not. Title-Cased headlines capitalize everything, so they are
  excluded from the casing tally and only contribute already-confirmed
  entities. Compounds come from contiguous capitalized runs. The trade-off
  is recall on thin, Title-Case-only feeds (see Limitations) — accepted in
  exchange for topics that are always nameable.
- **Compound beats constituent via a phrase boost.** Multiplying signal by
  `1 + 0.5·(words−1)` lets "Iran War" win the greedy claim before "Iran",
  and the existing bleed-over guard then drops the fragmented unigram. This
  reuses the clustering machinery instead of a separate subsumption pass.
- **Same story across outlets is grouped, not hidden.** Earlier the engine
  deduped syndicated copies and discarded all but the most recent. Now exact
  duplicates are grouped (and similar headlines fuzzy-merged within a topic)
  into a story that reports how many outlets ran it — the multi-outlet
  signal the user asked to see. Scoring still runs on representatives so
  syndication volume doesn't distort cluster strength.
- **Peek before read.** A topic row is a triage surface, not a destination.
  Hover (desktop) / tap (mobile) shows a teaser; the click commits to the
  reader. Reusing `ArticleContent`, `HoverCard`, and `Sheet` keeps it to one
  small component with no new primitives beyond the HoverCard wrapper.
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

- **Strict entity gate can leave sparse feeds quiet.** Proper-noun
  detection needs sentence-case casing evidence. Feeds that publish only
  Title-Case headlines with empty/thin bodies give the lexicon nothing to
  confirm, so fewer (or no) topics surface. This is the deliberate
  trade-off for "topics are always nameable"; the empty-but-ready caption
  covers the degenerate case. A future relaxation could admit
  recurring-bigram entities even from Title-Case headlines if recall proves
  too low in practice.
- **Capitalization is script-bound.** Casing-based entity detection only
  works for cased scripts (Latin, Cyrillic, Greek). CJK and other caseless
  scripts produce no entities and therefore no topics — a stricter form of
  the English-only limitation below.
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
