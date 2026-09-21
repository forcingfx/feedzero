# Feature 002: Persistent Storage Across Sessions

## Status
Implemented (Option A)

## Summary

Feed and article data persists across browser sessions. The encryption salt is stored in IndexedDB on first launch and reused on subsequent launches, so the same passphrase always derives the same encryption key.

## Behaviour

```gherkin
Feature: Data persists across browser sessions

  Scenario: Feeds survive browser restart
    Given the user has added feeds to the app
    When the user closes and reopens the browser
    Then the feed list shows the previously added feeds
    And selecting a feed shows its articles

  Scenario: Wrong passphrase cannot read data
    Given the user has added feeds encrypted with passphrase A
    When the app opens with passphrase B
    Then no feeds are displayed (decryption fails silently)
```

## Architecture

### How it works

1. On first `open(passphrase)`, no salt exists in the `meta` store
2. A random 16-byte salt is generated and stored in `meta`
3. The passphrase + salt derive an AES-GCM-256 key via PBKDF2
4. On subsequent `open(passphrase)` calls, the stored salt is read and reused
5. Same passphrase + same salt = same key = data is decryptable

### Transaction discipline

Every Dexie call in `db.ts` opens its own transaction, via the
`ctx.op((db) => …)` accessor that `requireOpen()` returns. Reaching
through `ctx.db` directly would make the call join whichever
transaction happens to be running when it starts, which breaks as soon
as that transaction commits during an `await crypto.subtle…`. The one
place allowed to talk to Dexie directly is `replaceTablesAtomically`,
whose calls belong to the atomic clear-and-replace the sync import
needs. See [ADR 030](../decisions/030-dexie-transaction-isolation.md)
and [the incident](../incidents/2026-09-21-dexie-transaction-zone-bleed.md).

### What was fixed

`db.js` previously called `generateSalt()` on every `open()`, meaning each session derived a different key. The fix reads the existing salt from `meta` before generating a new one.

### Files

| File | Role |
|------|------|
| `src/core/storage/db.js` | Fixed `open()` to reuse stored salt |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/storage/db.test.js` | Persistence across close/reopen (2 new tests) |

## Design Decisions

- **Default passphrase retained** — Real passphrase prompt is a separate feature (Option B). This fix makes persistence work with the existing hardcoded key.
- **Silent decryption failure** — If the wrong passphrase is used, `getAllDecrypted` skips records that fail to decrypt and returns an empty array. No error thrown — the UI simply shows no data.

## Orphan Cleanup

Records encrypted with a previous (wrong) key remain in IndexedDB with valid plaintext index fields (e.g. `url`) but undecryptable content. These "orphan" records cause false-positive duplicate detection — the URL exists in the index but the feed doesn't appear in the decrypted list.

`feed-service.js` handles this in `addFeedFlow()`: if the URL exists in the index but not in decrypted feeds, the orphaned records are removed via `removeFeedsByUrl()` before re-adding.

## Limitations

- Data lost if browser storage is cleared
- Derived keys stored in localStorage — if stolen, can decrypt local IndexedDB data (but cannot recover passphrase or access cloud vault)
