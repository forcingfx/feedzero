# ADR 022: User preferences sync via the vault, with timestamp last-write-wins

## Status
Accepted (2026-05-22)

## Context

A class of user preferences lived as loose, **unencrypted** `localStorage`
keys and never synced across devices:

- `feedzero:feed-sort-mode`, `feedzero:feed-custom-order`,
  `feedzero:folder-custom-order` (feed-store)
- `feedzero:article-sort-mode` (article-store)
- `feedzero:group-article-floods` (app-store)

Two problems:

1. **They don't follow the user.** Manual feed/folder ordering — deliberate
   organizational work — silently differed on every device. This is the
   same gap ADR 019 closed for folders/smartFilters, for a different data
   shape.
2. **They violate "encrypt at rest."** Custom feed/folder ordering reveals
   feed identities and relative interest; storing it in plaintext
   localStorage is inconsistent with the privacy principle.

The obvious move — "add another vault collection like folders" — is wrong
here. `mergeVaults` reconciles id-keyed collections with `mergeByIdLocalWins`
(local wins on id collision). Preferences are a **single scalar record**, not
a collection: a lone preferences object keyed by a fixed id would *always*
let local win, so a change made on device B would never propagate to device
A. Scalars need a different conflict rule.

A second hazard is specific to scalars. The routine pull path (boot,
`refreshAll`) does a **pure replace** via `importVault` — `mergeVaults` only
runs in the explicit `switchToExistingCloud` flow. Combined with the
debounced push (`scheduleSyncPush`, 5s + 0–30s jitter), a stale device can
clobber a newer one, and a device can even clobber its *own* just-changed
setting when a refresh pull lands before its pending push.

## Decision

`VaultData` v3 adds an **optional** scalar `preferences` plus a
`preferencesUpdatedAt` timestamp:

```ts
export interface VaultData {
  version: number;
  exportedAt: number;
  feeds: Feed[];
  articles: Article[];
  folders?: Folder[];
  smartFilters?: SmartFilter[];
  preferences?: UserPreferences;
  preferencesUpdatedAt?: number;
}
```

**Storage.** Preferences live in a new encrypted single-row `preferences`
Dexie table (`id = "preferences"`), encrypted at rest like every other row.
The local last-modified timestamp lives in the existing unencrypted `meta`
table under `preferencesUpdatedAt` (a non-sensitive number — no schema
column needed). `putPreferences` writes both atomically.

**Conflict resolution = timestamp last-write-wins.**

- `mergeVaults` selects preferences via `mergePreferencesLatestWins`: the
  side with the newer `preferencesUpdatedAt` wins; a tie favors local
  (matching `mergeByIdLocalWins`'s local-bias); when only one side defines
  preferences that side is taken; when neither does the result is
  `undefined`.
- The routine pull path is timestamp-gated in `sync-store.pull` via
  `gatePreferencesByTimestamp`: if local preferences are at least as new as
  the cloud's, the pulled `preferences` are set to `undefined` so
  `importAll` leaves the local row untouched — **reusing the ADR 019
  undefined-vs-present contract** as the "no opinion" signal. This defeats
  the self-clobber-on-refresh race without adding new machinery.
- `forceResync` / `switchToExistingCloud` are explicit cloud-authority
  actions and are NOT gated — they adopt cloud preferences verbatim, then
  `usePreferencesStore.reload()` refreshes the in-memory stores.

**Single source of truth.** A new `preferences-store` owns the record.
`hydrate()` (run before `isDbReady` on boot) loads the DB row or, on first
boot, migrates the legacy localStorage keys into it and clears them. Consumer
stores (feed/article/app) keep an in-memory field for synchronous reads but
their setters drop `localStorage.setItem` and write through a cycle-safe
`persistPreferences` helper, which persists the row and schedules the sync
push.

## Consequences

### Positive
- Feed/folder ordering, sort modes, and flood grouping follow the user
  across devices, encrypted at rest.
- Preferences are immune to the debounced-push / self-clobber race that the
  rest of the vault tolerates — a strict improvement for scalars.
- The `undefined` "no opinion" contract is reused, not reinvented; back-compat
  with pre-v3 vaults is automatic (an old vault omits both keys → local
  preferences survive).
- One first-class home for preferences; future settings add a field, not a
  new localStorage key.

### Negative
- A second conflict model now exists in `mergeVaults` (id-merge for
  collections, timestamp-LWW for the scalar record). The distinction is
  documented at the `VaultData` definition and pinned by tests.
- The LWW timestamp lives in unencrypted `meta`. It leaks only "preferences
  changed at time T", which is already observable from vault upload times.

### Neutral
- `SYNC.FORMAT_VERSION` 2 → 3 and `DB_VERSION` 5 → 6 (Dexie auto-creates the
  new table). The format version is informational; consumers tolerate any
  shape.
- `theme` is wired via the `<ThemeBridge>` component
  (`src/components/theme-bridge.tsx`) mounted under `<ThemeProvider>`
  in `src/main.tsx`. The bridge is one-way (vault → next-themes); the
  reverse direction is owned by `ThemeToggle`'s click handler, which
  calls `setTheme()` and `usePreferencesStore.update({ theme })`
  atomically. next-themes still owns first paint via its `<head>` script
  + its own localStorage cache, so the originally-feared flash only
  appears in the one case we couldn't avoid by construction: a
  cross-device pull where the user picked a different theme on the
  other device. Locked by
  `tests/components/theme-bridge.test.tsx` (one-way invariant) and
  `tests/components/settings/theme-toggle-vault.test.tsx` (write-through).

## Alternatives considered
- **Model preferences as an id-keyed collection and reuse
  `mergeByIdLocalWins`.** Rejected: local always wins on id collision, so a
  single preferences row would never propagate from another device.
- **Keep preferences in localStorage, thread them into the vault separately.**
  Rejected: splits the source of truth (vault export reads the encrypted DB),
  leaves ordering data in plaintext, and needs a parallel sync path.
- **Per-field timestamps / CRDT.** Rejected as over-engineering for a handful
  of low-churn scalars; whole-record LWW is sufficient and far simpler.

## References
- ADR 019 (folder/smartFilter sync) — the undefined-vs-`[]` contract reused here
- `src/core/sync/sync-service.ts:mergeVaults` + `mergePreferencesLatestWins`
- `src/stores/sync-store.ts:gatePreferencesByTimestamp`
- `src/stores/preferences-store.ts` — single source of truth + migration
- `src/core/storage/db.ts` — `preferences` table + accessors
- `tests/core/sync/preferences-vault-roundtrip.test.ts`,
  `tests/integration/sync-store-db.test.ts`,
  `tests/stores/preferences-store.test.ts` — pinned tests
