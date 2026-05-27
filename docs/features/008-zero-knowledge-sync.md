# Feature 008: Zero-Knowledge Sync

## Status
Implemented

## Summary

Users with a 4-word passphrase can push their encrypted feeds and articles to a server, then pull them back on any new browser using the same passphrase. The server stores only opaque encrypted blobs and never sees plaintext. The feature is vendor-neutral: a standalone Hono server supports self-hosting, with Vercel wrappers for cloud deployment.

## Behaviour

```gherkin
Feature: Zero-knowledge cloud sync

  Scenario: New user enables sync during onboarding
    Given a new user on the onboarding screen
    When they choose "Sync across devices" and confirm their passphrase
    Then their feeds and articles are encrypted and pushed to the server
    And derived cryptographic keys (JWK format) are stored in localStorage for future sessions
    And the raw passphrase is discarded from memory and never persisted

  Scenario: Returning sync user opens the app
    Given a returning user with sync enabled
    When the app initializes
    Then it pulls the encrypted vault from the server
    And decrypts and imports the data into local IndexedDB
    And loads feeds normally

  Scenario: Recovering on a new device
    Given a user with an empty browser and a valid passphrase
    When they enter their passphrase in the recovery step
    Then the app pulls and decrypts the vault from the server FIRST
    And only then initializes a fresh local database (with skipServerCleanup)
    And imports all feeds and articles locally
    And if the pull fails, no local state is modified and the error is shown

  Scenario: Data changes trigger sync
    Given a sync-enabled user
    When they add a feed, remove a feed, refresh feeds, or read an article
    Then a debounced push (5s) sends the updated encrypted vault to the server

  Scenario: User disables sync
    Given a sync-enabled user
    When they switch to local-only from the Data & Storage dialog
    Then the encrypted vault is deleted from the server
    And local data is preserved
    And the sync status chip turns amber

  Scenario: User logs out (clear local, keep cloud)
    Given a sync-enabled user
    When they click "Log out of this device" from the Data & Storage dialog
    And confirm the action
    Then all local data is deleted (IndexedDB, localStorage)
    And the encrypted cloud vault is NOT deleted
    And the app returns to the onboarding screen
    And they can later recover by entering their passphrase

  Scenario: Refresh pulls cross-device changes first
    Given a sync-enabled user with feeds on multiple devices
    When they refresh all feeds on device B
    Then device B first pulls the latest vault from the server
    And imports any new feeds or changes from device A
    And then refreshes all feeds (including newly imported ones)
    And pushes the updated vault back to the server

  Scenario: Unpushed local change survives a reload
    Given a sync-enabled user who renamed a feed
    And the 5s debounced push has not fired yet
    When they reload the app (dropping the in-memory debounce timer)
    Then a persisted "pending push" marker records the unsynced change
    And the next pull() flushes that change to the server BEFORE importVault
    And the rename is preserved instead of being reverted to the cloud copy
    And if the flush cannot reach the server, the pull aborts (local kept)

  Scenario: Local-only user enables sync later
    Given a local-only user
    When they click Enable sync in the Data & Storage dialog
    Then they are guided through passphrase generation and confirmation
    And their data is encrypted and pushed to the server

  Scenario: Local-only user switches to existing cloud account (replace)
    Given a local-only user with feeds
    And a cloud account exists with different feeds
    When they click "Use existing cloud account" in the Data & Storage dialog
    And enter the existing passphrase
    And choose "Replace local with cloud"
    Then their local feeds are deleted
    And the cloud feeds are imported
    And they become a sync-enabled user

  Scenario: Local-only user switches to existing cloud account (merge)
    Given a local-only user with feeds
    And a cloud account exists with different feeds
    When they click "Use existing cloud account" in the Data & Storage dialog
    And enter the existing passphrase
    And choose "Merge feeds"
    Then their local feeds are preserved
    And the cloud feeds are merged (duplicates by URL skipped)
    And the merged vault is pushed to the server
    And they become a sync-enabled user

  Scenario: Invalid passphrase shows error
    Given a local-only user
    When they click "Use existing cloud account" in the Data & Storage dialog
    And enter an invalid passphrase
    Then they see an error "No cloud data found for this passphrase"
    And can try again or cancel

  Scenario: Server never sees plaintext
    Given any sync operation
    Then the server only stores/retrieves opaque encrypted blobs
    And vault IDs are derived from the passphrase (not the data)

  Scenario: Restore from cloud after stale local state
    Given a sync-enabled user whose local state has drifted from the cloud
    When they click "Restore from cloud" in the Data & Storage dialog
    And confirm the replace
    Then the cloud vault is pulled and imported into local storage
    And the feed and article stores refresh in place
    And a toast reports "Restored N feeds from cloud."
    And the dialog closes
```

## Architecture

### Cryptographic Scheme

```
passphrase
   |
   +---> PBKDF2(passphrase, "feedzero:vault-id:v1",  100k, SHA-256) ---> vault ID (32 bytes, hex)
   |     Server-side lookup key. Never touches encryption.
   |
   +---> PBKDF2(passphrase, "feedzero:enc-salt:v1",  100k, SHA-256) ---> encryption salt (16 bytes)
         |
         +---> PBKDF2(passphrase, encryption_salt,    100k, SHA-256) ---> AES-GCM-256 key
               Encrypts/decrypts the vault payload.
```

Same passphrase always produces same vault ID and same encryption key. No external state needed on new devices.

### Flow

1. **Push**: `exportAll()` from IndexedDB -> serialize to `VaultData` -> `encryptVault()` with AES-GCM-256 -> PUT `/api/sync` with vault ID + ciphertext
2. **Pull**: GET `/api/sync?vaultId=<hex>` -> `decryptVault()` -> `importAll()` into IndexedDB. `importAll`'s clear+bulkPut runs in a single Dexie `rw` transaction so concurrent callers serialize at the storage layer and never expose the mid-clear empty state. **Flush-before-import:** if a `feedzero:sync-pending-push` marker is set (a local change whose debounced push never fired — e.g. a rename made just before a reload dropped the timer), `pull()` pushes local to the server first, then imports. Otherwise `importAll`'s replace-all would silently revert the unsynced change to the stale cloud copy. A failed flush aborts the pull (local data is kept).
3. **Delete**: DELETE `/api/sync?vaultId=<hex>` -> removes encrypted blob from server
4. **Startup (sync user)**: `initializeReturningUser` kicks off the initial `pull()` in the background and flips `isDbReady=true` immediately so the UI renders the canary-validated local DB without waiting on the network round-trip (previously up to 10s on slow mobile networks — the "Loading… then stale feed" complaint). `AppInit`'s `isDbReady` effect then fires `refreshAll`; its internal `syncStore.pull()` awaits the same in-flight pull via sync-store's `inFlightPull` dedup (the race that justified the old await — `importAll`'s clear+bulkPut interleaving readers, see `tests/e2e/sync-100-feeds.spec.ts` — is prevented by the dedup, not by blocking boot). Once `refreshAll` finishes its publisher fetches, freshly-fetched articles auto-render via the article-store reload at refresh's tail.
5. **Refresh all (sync user)**: Pull vault -> reload feeds from DB -> refresh all feeds -> reload feeds -> push
6. **After mutations**: Set the `sync-pending-push` marker, then debounced push (5s after last change). The marker outlives a reload that drops the timer; a successful push clears it.
7. **Disable sync**: Delete server vault -> clear localStorage keys -> reset store to local-only
8. **Logout**: Delete local DB -> clear all localStorage keys -> reset to onboarding (cloud vault preserved)
9. **Check vault exists**: HEAD `/api/sync?vaultId=<hex>` -> returns true if 200, false if 404
10. **Switch to existing cloud (replace)**: Check vault exists -> pull vault -> `importAll()` (clears local) -> set status to synced
11. **Switch to existing cloud (merge)**: Check vault exists -> pull cloud vault -> export local vault -> merge by URL/guid -> `importAll()` -> push merged vault

### Storage Adapter Pattern

Server storage uses a pluggable adapter interface:

| Adapter | File | Use Case |
|---------|------|----------|
| Filesystem | `src/core/sync/adapters/filesystem-adapter.ts` | Self-hosting (default) |
| Vercel Blob | `src/core/sync/adapters/vercel-blob-adapter.ts` | Vercel deployment |
| Memory | `src/core/sync/adapters/memory-adapter.ts` | Dev server, tests |

### Server Architecture

All API handlers use the Web standard `Request -> Response` pattern. Three entry points:

- `server.ts` — Hono standalone server (`npm run serve`) for self-hosting
- `api/sync.ts` — Vercel serverless wrapper (thin wrapper in git; pre-bundled with all deps inlined during build — see ADR 007)
- `vite.config.js` — Dev proxy with memory adapter

### Files

| File | Role |
|------|------|
| `src/utils/base64.ts` | Base64 encode/decode for vault ciphertext |
| `src/core/sync/types.ts` | `VaultData`, `EncryptedVault`, `SyncStorageAdapter` interfaces |
| `src/core/sync/vault-crypto.ts` | Vault ID derivation, key derivation, encrypt/decrypt |
| `src/core/sync/sync-service.ts` | Client-side orchestration: export, import, push, pull, delete, checkVaultExists, mergeVaults. Pads vault payloads to power-of-2 bucket sizes. |
| `src/core/storage/key-material.ts` | Key derivation, JWK export/import, localStorage persistence. `deriveAndStoreKeys`, `loadStoredKeys`, `clearStoredKeys` |
| `src/core/sync/sync-handler.ts` | Server-side `handleSyncRequest(req, adapter)` |
| `src/core/sync/adapters/memory-adapter.ts` | In-memory storage adapter |
| `src/core/sync/adapters/filesystem-adapter.ts` | Filesystem storage adapter |
| `src/core/sync/adapters/vercel-blob-adapter.ts` | Vercel Blob storage adapter |
| `src/core/sync/adapters/resolve-adapter.ts` | Reads `SYNC_STORAGE` env var, returns adapter |
| `src/stores/sync-store.ts` | Zustand store: `enableSync`, `push`, `pull`, `forceResync` (user-initiated "replace local with cloud"), `scheduleSyncPush` (5s debounce + 0-30s jitter), `logout`, `switchToExistingCloud`. Stores `credentials: SyncCredentials | null` (not raw passphrase). |
| `server.ts` | Hono standalone server |
| `api/sync.ts` | Vercel serverless wrapper (pre-bundled during build, ADR 007) |

### Tests

| File | Coverage |
|------|----------|
| `tests/utils/base64.test.ts` | Round-trip encoding |
| `tests/core/sync/vault-crypto.test.ts` | Determinism, hex format, encrypt/decrypt, wrong-key failure |
| `tests/core/sync/sync-service.test.ts` | Export, import, push, pull with mocked fetch |
| `tests/core/sync/sync-service-switch.test.ts` | checkVaultExists, mergeVaults (feed/article deduplication) |
| `tests/core/sync/sync-handler.test.ts` | GET/PUT validation, 404/400/413 errors |
| `tests/core/sync/adapters/memory-adapter.test.ts` | CRUD operations |
| `tests/core/sync/adapters/filesystem-adapter.test.ts` | File I/O, directory creation, path traversal |
| `tests/core/storage/key-material.test.ts` | deriveAndStoreKeys, loadStoredKeys, clearStoredKeys |
| `tests/stores/sync-store.test.ts` | State transitions, debounce, credentials persistence |
| `tests/stores/sync-store-switch.test.ts` | switchToExistingCloud replace/merge modes |
| `tests/server.test.ts` | Hono app route mounting |
| `tests/app.test.tsx` | Sync-aware initialization |
| `tests/e2e/sync.spec.ts` | E2E tests for existing cloud account flow |

## Design Decisions

- **Deterministic salt derivation** — The passphrase alone is sufficient to derive both vault ID and encryption key. No external state needed on new devices.
- **Vault ID and encryption key are cryptographically independent** — Different PBKDF2 salts ensure the server-side lookup key reveals nothing about the encryption key.
- **Derived keys in localStorage, passphrase discarded** — Raw passphrase is never persisted. Derived JWK keys (DB key, HMAC key, optionally vault key + vault ID) are stored instead. Stolen keys can decrypt local data but cannot recover the passphrase or access the cloud vault from another device. Legacy users with stored passphrases are auto-migrated on first load.
- **Full-state sync, last-write-wins** — Entire vault uploaded/downloaded as one blob. Acceptable for Phase 1.
- **Storage adapter pattern** — Vendor-neutral. Default is filesystem for self-hosting; Vercel Blob is opt-in.
- **Hono standalone server** — 14kB Web standard framework. Runs on Node, Deno, Bun. Same `Request/Response` API as handlers.
- **Merge by URL for feeds, by guid for articles** — When merging local and cloud vaults, feeds are deduplicated by URL (local preferred for duplicates). Articles are deduplicated by guid. Cloud article feedIds are remapped to local feed ids when the parent feed URL matches.

## Limitations

- No conflict resolution — last push wins. The `sync-pending-push` flush makes "this device has the freshest local change" win over a stale cloud copy on pull, but a genuine cross-device conflict (both sides edited the same feed since the last sync) still resolves last-push-wins.
- No incremental sync — full vault transferred each time
- Vault size limited to 5MB
- No passphrase change/rotation flow yet
