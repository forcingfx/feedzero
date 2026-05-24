# Feature 023: Signal Briefings

## Status

Implemented (2026-05-24).

## Summary

Signal Briefings let a Personal+ user create a standing prompt (e.g. "EU
AI Act enforcement actions"), save it like a feed, and on demand
generate an AI-written briefing with citations drawn from their own
subscribed feeds. The user supplies their own Anthropic API key
(BYO — see ADR 024). On Refresh, the key + payload transit
`POST /api/briefing` (a same-origin relay forced on us by iOS Safari's
cross-origin policy) on the way to Anthropic — the relay does not log,
persist, or inspect either. Briefings auto-flag "refresh available"
when new matching articles arrive (auto-bumped stale counter), but the
LLM call only fires on an explicit user click.

## Behaviour

```gherkin
Feature: Signal Briefings

  Scenario: Create and refresh a briefing as a Personal+ user with an API key
    Given I am on the Personal tier
    And I have pasted my Anthropic API key in Settings → Briefings
    And my feeds cover the topic strongly enough (signal score ≥ 15)
    When I open the New briefing dialog and submit a name + prompt
    Then a briefing row is persisted and I'm navigated to its page
    When I click Refresh
    Then the local matcher selects the top-30 relevant articles
    And the local signal-score gate confirms the corpus is strong enough
    And my browser calls api.anthropic.com directly with the prompt + excerpts
    And the resulting abstract + citations + suggested feeds render

  Scenario: Free-tier user sees the upgrade splash
    Given I am on the Free tier
    When I click Briefings in the sidebar
    Then I see the matrix-derived UpgradeSplash for signal-briefings
    And no briefings store call is made

  Scenario: Personal+ user without an API key
    Given I am on the Personal tier
    And no Anthropic key is stored
    When I click Refresh on a briefing
    Then status becomes "no-api-key" with a Settings link
    And no LLM call is made

  Scenario: Personal+ user with a thin corpus
    Given I am on the Personal tier and have an API key
    But my feeds only cover the topic with one article on one feed
    When I click Refresh
    Then status becomes "not-enough-evidence" with the local score shown
    And no LLM call is made

  Scenario: New articles flag a briefing as stale
    Given I have a briefing with lastRunAt = T0
    When refreshAll() ingests N new articles after T0 that match the prompt
    Then the briefing's staleArticleCount becomes N
    And the sidebar shows an amber dot on the Briefings entry
    But no LLM call is made until I click Refresh

  Scenario: Briefings + Anthropic key sync across devices
    Given I create a briefing on device A and paste an API key on device A
    When device B syncs the vault and pulls
    Then device B sees the briefing in the sidebar
    And device B does not require me to re-paste the API key
```

## Architecture

### Flow

Create:
1. User clicks "+ New briefing" → `NewBriefingDialog` captures name + prompt.
2. The dialog runs `matchArticles` + `computeSignalScore` against the
   current corpus to preview the signal band before save.
3. `useBriefingStore.createBriefing` enforces the feature gate
   + `checkBriefingQuota` (cap 10 on every paid tier), calls `db.addBriefing`,
   reloads + `scheduleSyncPush`.
4. Navigate to `/briefings/:newId`.

Refresh:
1. User clicks Refresh on a briefing page.
2. Store calls `getAnthropicKey()` from the encrypted secrets table.
3. Store calls `refreshBriefingFlow({ briefing, articles, apiKey,
   modelId, signal })` from the briefing-service.
4. Service runs `matchArticles` (top-30) + `computeSignalScore`. If
   below `BRIEFING_MIN_SCORE = 15`, returns `not-enough-evidence`
   without touching the network.
5. Service calls `generateBriefing` from the briefing-client. The
   client constructs a `new Anthropic({ apiKey,
   dangerouslyAllowBrowser: true })` and posts to
   `api.anthropic.com/v1/messages` with tool_choice forcing the
   `submit_briefing` tool. System prompt enforces: only cite
   provided articles, never invent facts.
6. Service calls `resolveSuggestedFeeds` to flip each pending
   suggestion to resolved or unreachable via the existing
   `discoverFeed` cascade.
7. Service overrides the model's self-reported `signalScore` with
   the local computation, stamps `lastRunAt`, resets
   `staleArticleCount`, returns the updated Briefing.
8. Store calls `db.updateBriefing`, reloads, `scheduleSyncPush`.
9. Page re-renders with the new `lastReport`.

Auto-stale tracking (no LLM):
1. `useFeedStore.lastRefreshAllAt` changes after a `refreshAll()`.
2. `useBriefingAutoRefresh` hook fires `refreshStaleCounts(allArticles)`.
3. For each briefing, the store runs `matchArticles` against articles
   ingested after `briefing.lastRunAt` and updates `staleArticleCount`.
4. The sidebar reads the aggregate and shows an amber dot.

### Files

| File | Role |
|------|------|
| `src/core/briefings/models.ts` | Supported Claude model registry (Haiku 4.5 / Sonnet 4.6 / Opus 4.7) |
| `src/core/briefings/prompt-matcher.ts` | IDF-weighted local matcher, pure |
| `src/core/briefings/signal-score.ts` | 0–100 score + bands + LLM-call gate |
| `src/core/briefings/briefing-client.ts` | Anthropic SDK wrapper, tool-use forcing |
| `src/core/briefings/feed-suggester.ts` | Resolves LLM suggestions through discoverFeed |
| `src/core/briefings/briefing-service.ts` | Orchestrator (pure, no I/O) |
| `src/core/storage/schema.ts::createBriefing` | Briefing factory (Result) |
| `src/core/storage/db.ts` | Adds `briefings` + `secrets` Dexie tables + CRUD |
| `src/core/storage/secrets.ts` | Typed Anthropic-key accessors |
| `src/core/sync/types.ts::VaultData` | Extended with `briefings` + `secrets` |
| `src/core/sync/sync-service.ts` | exportVault/importVault/mergeVaults extended |
| `src/core/features/tier-matrix.ts` | `signal-briefings` matrix entry (Personal+, cap 10) |
| `src/core/features/quotas.ts` | `BRIEFINGS_LIMIT_PRO` + `checkBriefingQuota` |
| `src/stores/briefing-store.ts` | CRUD + refresh + auto-stale |
| `src/hooks/use-briefing-auto-refresh.ts` | Stale-counter hook |
| `src/pages/briefing-page.tsx` | Page + state-machine splashes |
| `src/components/briefings/*` | Gauge, abstract, citations, suggested feeds, dialog |
| `src/components/settings/tabs/briefings-tab.tsx` | API key + model picker |
| `src/components/layout/sidebar-body.tsx` | Sidebar entry with stale dot |
| `src/lib/briefing-model-preference.ts` | Device-local model preference |
| `src/lib/go-to-briefing.ts` | Navigation helper |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/features/tier-matrix.test.ts` | Matrix shape, Personal+, cap |
| `tests/core/features/quotas.test.ts` | Briefing quota boundary + bypasses |
| `tests/core/storage/briefing-schema.test.ts` | Factory validation |
| `tests/core/storage/briefing-db.test.ts` | Encrypted CRUD round-trip |
| `tests/core/storage/secrets.test.ts` | API-key persistence + close/reopen |
| `tests/core/briefings/prompt-matcher.test.ts` | IDF ranking, tiebreak, topK |
| `tests/core/briefings/signal-score.test.ts` | Calibration anchors + bands |
| `tests/core/briefings/briefing-client.test.ts` | SDK mocked: parse, errors, abort |
| `tests/core/briefings/feed-suggester.test.ts` | discoverFeed wiring |
| `tests/core/briefings/briefing-service.test.ts` | Every reason-code branch |
| `tests/integration/briefing-store-db.test.ts` | Store ↔ real db, mock-at-boundary |
| `tests/core/sync/briefings-sync.test.ts` | Vault round-trip + merge invariants |

## Design Decisions

- **BYO Anthropic key, browser-direct.** See ADR 024 — the only shape
  that fits the privacy charter without lying. The FeedZero server
  never sees the prompt or the articles.
- **Refusal-before-inference.** A signal score below 15 short-circuits
  to a "not-enough-evidence" splash. Cheaper, more honest, and protects
  the user from paying for a result they wouldn't trust.
- **Locally-computed signal score wins over the model's
  self-assessment.** The model only sees what we sent; trusting its
  confidence-claim would be circular.
- **Tool-use over freeform JSON.** Forcing the `submit_briefing` tool
  with `tool_choice` makes structured output the only path, and the
  SDK validates the input shape before we get the call back.
- **Briefings + Anthropic key sync via the vault.** Adding them to
  VaultData ensures a user setting up a new device gets their work
  back without having to re-paste their key. Conflict model: id-keyed
  collections merge local-wins; secrets pick whichever side has a
  value (so a new device picks up the key without overwriting an
  active local one).
- **Model choice is device-local (localStorage).** Phone vs laptop
  budgets differ and keeping the choice out of the synced vault
  avoids a schema migration for a low-stakes setting.

## Limitations

- **Discovery cost.** A user without an Anthropic key sees a "Paste a
  key in Settings" splash on every briefing they open. The Settings
  tab links explain how but the friction is real.
- **No usage analytics.** Consistent with the rest of the product;
  noted because it limits the iteration loop on prompt quality.
- **English-only matcher.** Mirrors the Signal frequency engine. The
  briefing matcher's MIN_LEN is lowered from 3 to 2 so high-signal
  short proper nouns (EU, AI, UK, US) match.
- **No briefing scheduling.** Stale-counter + manual click is v1.
  Cron-like scheduling is deferred.
- **No embeddings.** IDF matching is the v1 pre-filter; revisit if
  briefing quality issues trace to article selection rather than
  model output.
- **No export-as-PDF / share-link / email-digest.** All deferred.
