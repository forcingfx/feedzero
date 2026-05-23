# ADR 023: Freshness fields are device-local, not synced

## Status
Accepted (2026-05-23)

## Context

`Feed` currently mixes two very different categories of state in one
record:

1. **Synced shape** — `id`, `url`, `title`, `description`, `siteUrl`,
   `folderId`, `preferFullText`, `prefetchEnabled`, `rules`,
   `createdAt`, `updatedAt`, `etag`, `lastModified`. These are the
   user's organizational intent or facts about the publisher; every
   device should agree on them.
2. **Device-local freshness** — `lastFetchedAt`,
   `lastSuccessfulFetchAt`, `lastError`, `consecutive304Count`. These
   describe *this device's* most recent attempt to reach the
   publisher. Two devices polling on independent timers will produce
   completely different values, and the truth is per-device, not
   global.

Today both halves ride together through the encrypted vault. Three
consequences fall out:

- **Refresh-storm push amp.** A 304-heavy refresh tick changes nothing
  meaningful — same title, same articles, same folder — but bumps
  `lastFetchedAt` on every feed, so `schedulePush()` re-encrypts the
  full vault and PUTs it. The plan calls this out as the largest
  remaining vault-side write cost (refresh-efficiency, item C).
- **Cross-device freshness clobber.** Device A polls every 30 min;
  Device B every 6 hours. A pulls B's stale `lastFetchedAt` on the
  vault round-trip and now thinks one of its feeds was just refreshed
  when it wasn't. The "stale feed" badge starts lying. Auto-refresh
  decisions (`isFeedDueForRefresh`) read stale-from-another-device
  timestamps and skip a feed that actually needs polling on *this*
  device.
- **`lastError` is also wrong on the wrong device.** Device A's
  proxy-fetch 503 doesn't tell us anything about whether Device B can
  reach the feed. Surfacing A's error on B's sidebar is a misdiagnosis.

The plan flagged this as "needs an ADR before code" because the
back-compat surface — what to do with v3 vaults that contain freshness
fields — has more than one defensible answer.

## Decision

`Feed`'s freshness fields move out of the vault payload. They stay in
the same Dexie `feeds` table (no schema migration on the local side);
the change is in the **vault serialiser**, not the storage layer.

### Synced shape (in the vault)

Every existing field except the four freshness ones. Specifically: `id`,
`url`, `title`, `description`, `siteUrl`, `folderId`, `preferFullText`,
`prefetchEnabled`, `rules`, `createdAt`, `updatedAt`, `etag`,
`lastModified`.

`etag` and `lastModified` *do* stay in the vault. They're publisher-issued
HTTP cache validators — public information that's the same for every
device that hits the feed — and a new device benefits from inheriting
them on first sync so its first refresh of each feed can short-circuit
to 304 instead of re-downloading every body. This is also why they
weren't in the freshness category to begin with: they describe the
*publisher*, not *this device's recent activity*.

### Device-local (never in the vault)

- `lastFetchedAt`
- `lastSuccessfulFetchAt`
- `lastError`
- `consecutive304Count`

Each device computes these from its own refresh attempts. A fresh
device starts at undefined for every feed and populates as it polls.

### Vault format version 4

`VaultData.version` bumps from 3 → 4. The version is informational
per the existing back-compat rule (consumers tolerate any shape).
Writers at v4 emit feeds with freshness fields stripped; the merge and
import paths drop freshness on the cloud side.

### Pull / import behaviour

`importVault` and `mergeVaults` treat the cloud's freshness fields as
**undefined regardless of what's actually present**. A v3 vault written
by an older client still contains them; the new client ignores them
rather than honouring the older device's last poll. Local freshness on
the importing device is preserved untouched — exactly the same shape
ADR 022 used for `preferences === undefined` ("source has no opinion").

### Push behaviour

Two consequences fall out naturally without any new gating code:

1. Vault export drops freshness → the post-tick ciphertext is identical
   to the pre-tick one when nothing user-meaningful changed → callers
   can opportunistically skip the PUT by comparing hashes of
   consecutive exports. (Followup, not required for ADR correctness.)
2. The `schedulePush()` call sites in `feed-store.ts` stay unchanged.
   They still fire; the savings come from a smaller, deduped payload
   and from never overwriting another device's freshness via the merge.

### Local DB write paths

`persistFreshness` (`src/core/feeds/feed-service.ts`) keeps writing the
freshness fields onto the in-memory `Feed` object and through
`updateFeed`. The Dexie row shape is unchanged. Only the vault
serialiser cares about the split.

## Alternatives considered

- **Push-skip heuristic only** ("skip schedulePush when refresh produced
  zero new + zero updated articles"). Rejected: leaves freshness in the
  vault, so the cross-device clobber and the lying "stale" badge stay
  broken. Solves the symptom (extra PUTs) without the cause (cloud
  vault carrying per-device timing).
- **Separate `feed-freshness` Dexie table.** Rejected for now: doubles
  the indexed-store reads on every refresh, requires a Dexie schema
  bump and migration, and gives no upside the simpler "strip on
  serialise" doesn't. Reconsider only if a future feature needs to
  query freshness independently of feed metadata at scale.
- **Per-device sharded vaults** (one cloud blob per device). Rejected
  as out of scope — would require a vault-discovery flow and removes
  the "vault = full picture" invariant the recovery flow depends on.

## Consequences

### Positive
- A 304-only refresh tick produces an identical vault payload to the
  previous tick. The opportunistic push-dedupe follow-up turns those
  ticks into zero PUTs.
- The "stale feed" badge, `isFeedDueForRefresh` gating, and the
  `lastError` sidebar icon all reflect *this device's* state. Two
  devices polling on different schedules no longer confuse each other.
- Per-device freshness opens the door to per-device refresh interval
  preferences (cross-cutting with the `refreshIntervalMinutes`
  preference in `docs/plans/refresh-efficiency.md` Step 1).

### Negative
- A v3 client that pulls a v4 vault sees feed rows without freshness
  and renders them as "never fetched on this device" until its own
  first refresh — visually correct but a one-time UX bump for users
  who didn't upgrade simultaneously across devices. v3 clients
  continue working otherwise (the optional fields are simply absent).
- One more conditional in the vault serialiser: "strip if present."
  Pinned by a test that round-trips a feed with freshness through
  `exportVault` → `importVault` and asserts the freshness fields
  survive locally but never appear on the cloud side.

### Neutral
- `SYNC.FORMAT_VERSION` 3 → 4. The format version is informational; no
  consumer branches on it.
- DB schema is unchanged. `DB_VERSION` stays where it is.
- `schedulePush` call sites and shape are unchanged.

## Implementation outline (for the follow-up PR)

1. Add `FRESHNESS_FIELDS` constant in `src/core/sync/vault-shape.ts`
   listing the four field names. Export `stripFreshness(feed)`.
2. Update `exportVault` in `src/core/sync/sync-service.ts` to map feeds
   through `stripFreshness`.
3. Update `mergeVaults` and `importVault` to drop the freshness fields
   from cloud-sourced feeds before merge — keep local freshness on
   collision, leave undefined for cloud-only feeds.
4. Bump `SYNC.FORMAT_VERSION` to 4.
5. Tests:
   - Unit: `stripFreshness` returns a new object with the four fields
     undefined and every other field intact.
   - Round-trip: export → encrypt → decrypt → import preserves local
     freshness, ignores cloud freshness.
   - Cross-device: A pushes after refresh, B pulls; B's freshness for
     every feed is unchanged.
   - Back-compat: a synthetic v3 vault with freshness fields is
     imported; cloud freshness is ignored, local freshness preserved.
6. Update `docs/data-schema.md` to mark the four fields as
   device-local.

The opportunistic push-dedupe ("skip PUT when ciphertext-of-export
equals last PUT's hash") is **not** part of this ADR's scope — call it
out as a follow-up in the implementation PR.

## References

- `src/types/index.ts` — `Feed` interface (freshness fields lines 21-33,
  60).
- `src/core/feeds/feed-service.ts:persistFreshness` — local writer.
- `src/core/sync/sync-service.ts:exportVault` / `mergeVaults` /
  `importVault` — vault path.
- `docs/plans/refresh-efficiency.md` item (C) — the plan entry this ADR
  resolves.
- ADR 022 (preferences via vault) — the prior art for "undefined on
  import means no opinion."
