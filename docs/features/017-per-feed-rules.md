# Feature 017: Per-Feed Rules

## Status
Implemented

## Summary

Per-feed auto-action rules. A feed can carry a list of rules; each rule
pairs a condition (the same `ConditionGroup` AST as smart filters) with
one or more actions (`mark-read`, `star`, `mute`, `route-to-folder`).
Rules run on ingest during `refreshFeed` — matching articles get every
action applied before they are encrypted and written to IndexedDB, so
the final shape rides through the vault to every device.

Rules are **per-feed by design**: they live on `Feed.rules`, not in a
global collection. A user's mental model is "this feed is noisy in
these specific ways" — managed from the feed's own dropdown, not a
global rules dashboard. Global rules can be layered on later by
composing `[...globalRules, ...feed.rules]` into the same engine;
nothing about the v1 design forecloses that.

The mute action subsumes the never-shipped `mute-keywords` tier-matrix
entry — one feature, one engine.

## Behaviour

```gherkin
Feature: Per-feed rules

  Scenario: Mute a noisy keyword
    Given I subscribe to Tech Crunchies
    And I add a rule "title contains 'Sponsored' → mute"
    When Tech Crunchies publishes "Sponsored: Buy this"
    Then the article appears with muted = true
    And it does not show in the default article list
    And the "Show muted (N)" count for that feed reads 1

  Scenario: Star a favourite author
    Given I subscribe to Acoup
    And I add a rule "author equals 'Bret Devereaux' → star"
    When Acoup publishes a new post by Bret Devereaux
    Then the article appears starred at ingest
    And it cascades into existing offline-prefetch (starred → cached)

  Scenario: Route an article to a different folder
    Given f-tech lives in folder "Tech"
    And I add a rule "title contains 'crypto' → route-to-folder folder-Crypto"
    When f-tech publishes "Crypto winter, again"
    Then the article shows up under folder "Crypto"
    And it does not show under folder "Tech"
    And it still shows under f-tech's own view (the feed never loses its history)

  Scenario: A disabled rule does not run
    Given I have a rule, but I have flipped its "Enabled" switch off
    When matching articles arrive
    Then no action runs
    And the rule is preserved (paused, not deleted)

  Scenario: Multiple rules + multiple actions per rule
    Given rule A: title contains "Press release" → mark-read
    And rule B: title contains "Press release" → star
    When a matching article arrives
    Then it is both read and starred (every matching rule runs, every action runs, in order)

  Scenario: Free tier user cannot create rules
    Given I am on the Free tier with paid-tier launched
    When I open a feed's "Rules…" menu
    Then the editor toasts an upgrade prompt and does not mutate the feed
```

## Architecture

### Flow

1. User opens a feed's dropdown menu → "Rules…" sets `rulesEditorFeedId` in feed-store.
2. `<RulesEditorDialog>` mounts (at app root) and reads that slice. List view shows existing rules; add/edit transitions to the edit view.
3. The edit view reuses `<ConditionGroupEditor>` (from smart filters) for the predicate and a new `<ActionPicker>` for the actions. Save → `feed-store.addFeedRule` or `feed-store.updateFeedRule`.
4. Mutators flow through `persistFeedRules()` — a shared helper that pulls the feed from db, rewrites `Feed.rules`, writes back via `dbUpdateFeed`, reloads, schedules a sync push. One place to look when "rules don't sync" comes up in support.
5. On `refreshFeed` ingest, after dedup but before persistence, `applyRules(article, feed.rules ?? [], buildContext(...))` produces the final article shape. Disabled rules and feeds with no rules short-circuit.
6. The article rides through `addArticles` → encryption → IndexedDB; `muted`, `starred`, `read`, and `folderId` are all the final values from the rule pass.
7. View derivation: default views (`ALL_FEEDS_ID`, specific feed, folder) drop muted articles unless `showMuted` is on. Folder views honour `article.folderId` override (route destination). Starred + smart-filter views are user-explicit and always show muted.

### Files

| File | Role |
|------|------|
| `src/types/index.ts` | `Rule`, `RuleAction`, `CreateRuleInput`; `Feed.rules?`; `Article.muted?`, `Article.folderId?` |
| `src/core/storage/schema.ts` | `createRule` factory + `validateRule` for older-vault tolerance |
| `src/core/rules/engine.ts` | Pure `applyRules(article, rules, ctx) → Article` |
| `src/core/feeds/feed-service.ts` | Wires `applyRules` into the `refreshFeed` ingest path |
| `src/core/features/tier-matrix.ts` | `rules` entry (Personal+, shipped); `mute-keywords` dropped |
| `src/stores/feed-store.ts` | CRUD mutators + dialog open/close state |
| `src/stores/article-store.ts` | `showMuted` slice + `setShowMuted` + `selectMutedCount` + folder-override-aware derivation |
| `src/components/rules/rules-editor-dialog.tsx` | Two-mode editor (list + edit) |
| `src/components/rules/action-picker.tsx` | Action chip list + add-action dropdown |
| `src/components/settings/tabs/rules-audit-panel.tsx` | Read-only audit view across all feeds |
| `src/components/sidebar/feed-item.tsx` | "Rules…" dropdown entry |
| `src/app.tsx` | Mounts `<RulesEditorDialog>` at root |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/storage/rule-schema.test.ts` | `createRule` defaults, validation rejections, `validateRule` shapes |
| `tests/core/rules/engine.test.ts` | Pure engine: every action kind, multi-action rules, multi-rule composition, deterministic last-wins for route-to-folder, disabled-rule short-circuit, AND/OR groups, no mutation of input |
| `tests/core/feeds/refresh-rules.test.ts` | Integration: ingest applies rules (mocks the db boundary only); covers mute, multi-action, disabled, route-to-folder, no-rules no-op, undefined-rules-array no-op |
| `tests/stores/article-store-muted-view.test.ts` | Default views hide muted; starred view shows everything; `setShowMuted(true)` makes muted reappear; `selectMutedCount` is honest; unread badge ignores muted state |
| `tests/stores/article-store-folder-override.test.ts` | `article.folderId` routes the article to its target folder; specific-feed view still shows everything; un-overridden articles inherit feed's folder |
| `tests/stores/feed-store-rules.test.ts` | CRUD mutators (add, update, remove, reorder), gate-locked refusal for free tier, schema validation pass-through |
| `tests/core/features/tier-matrix.test.ts`, `tests/core/features/feature-gates.test.ts` | `rules` is Personal+ shipped; `mute-keywords` removed from the matrix |
| `tests/components/rules/rules-editor-dialog.test.tsx` | List + edit modes, empty state, save-disabled-until-valid, create-rule end-to-end |
| `tests/components/rules/rules-audit-panel.test.tsx` | Empty state, grouped-by-feed rendering, paused marker, Edit button opens the right feed |

## Design Decisions

- **Per-feed, not global, in v1.** A noisy feed is the user's mental anchor for a rule. Per-feed scoping means the editor's discoverability matches intent (open the feed, add a rule) and the blast radius of a typo is one feed, not every feed. Global rules can be layered later by composing into the same `applyRules` call.
- **Reuse the smart-filter `ConditionGroup` AST.** Rules and filters share predicate semantics; the only new surface is the action layer. Free regex safety, cycle guards, and unknown-feed tolerance from `evaluator.ts`.
- **Rules nest on `Feed`, not a top-level vault collection.** Avoids a new Dexie table, a new sync field, and a migration. `Feed[]` already rides the vault — rules ride with it.
- **Actions run at ingest, not on every render.** Smart filters re-evaluate continuously; rules transform once and persist. Different lifecycles → different concepts (see commit messages and Feature 016 for the contrast).
- **Mute is hide, not delete.** Reversible. The article still rides the vault and still counts toward the unread badge so the user can tell when a rule has caught something. `setShowMuted(true)` brings them back.
- **`mute-keywords` subsumed.** It was a placeholder coming-soon entry that became a single action of the broader engine. No migration needed — it never shipped.
- **Defense-in-depth gating.** The dialog gates via `useFeatureGate("rules")`; the store mutators gate again via `isRulesGateOpen()`. A console-prodded mutator can't bypass the UI.
- **`persistFeedRules` helper.** All four mutators flow through it, so the get-rewrite-save-reload-push dance happens in exactly one place. The "extract when the same multi-step dance repeats" rule from CLAUDE.md.

## Limitations

- **Single-pass on ingest only.** Edits to an existing rule don't retroactively apply to articles already in the vault. A future "Apply to existing articles" action in the editor will close this — needs a UI affordance and a batched mutator (idempotent: re-applying actions on already-correct state is a no-op).
- **No global rules yet.** The engine takes a `Rule[]` and doesn't care where they came from; adding a `globalRules` slice + composing it into the ingest call is the v1.1 path.
- **No tag action yet.** `apply-tag` is the most-asked-for v1.1 action per the competitor scan; it's a one-line addition to `RuleAction` plus a tag store, blocked only on whether we want to introduce tags as a first-class concept yet.
- **No "Apply rules to existing articles" pass.** Same shape as the single-pass limitation above — would surface as a button in the editor.
- **No browser-notification action.** `notify` was in the v1.1 candidate list; will land alongside the notifications permission UX, not before.
