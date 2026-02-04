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
    And the passphrase is stored in localStorage for future sessions

  Scenario: Returning sync user opens the app
    Given a returning user with sync enabled
    When the app initializes
    Then it pulls the encrypted vault from the server
    And decrypts and imports the data into local IndexedDB
    And loads feeds normally

  Scenario: Recovering on a new device
    Given a user with an empty browser and a valid passphrase
    When they enter their passphrase in the recovery step
    Then the app pulls and decrypts the vault from the server
    And imports all feeds and articles locally

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

  Scenario: Local-only user enables sync later
    Given a local-only user
    When they click Enable sync in the Data & Storage dialog
    Then they are guided through passphrase generation and confirmation
    And their data is encrypted and pushed to the server

  Scenario: Server never sees plaintext
    Given any sync operation
    Then the server only stores/retrieves opaque encrypted blobs
    And vault IDs are derived from the passphrase (not the data)
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
2. **Pull**: GET `/api/sync?vaultId=<hex>` -> `decryptVault()` -> `importAll()` into IndexedDB
3. **Delete**: DELETE `/api/sync?vaultId=<hex>` -> removes encrypted blob from server
4. **Startup (sync user)**: Pull first, then load from local DB
5. **After mutations**: Debounced push (5s after last change)
6. **Disable sync**: Delete server vault -> clear localStorage keys -> reset store to local-only

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
| `src/core/sync/sync-service.ts` | Client-side orchestration: export, import, push, pull, delete |
| `src/core/sync/sync-handler.ts` | Server-side `handleSyncRequest(req, adapter)` |
| `src/core/sync/adapters/memory-adapter.ts` | In-memory storage adapter |
| `src/core/sync/adapters/filesystem-adapter.ts` | Filesystem storage adapter |
| `src/core/sync/adapters/vercel-blob-adapter.ts` | Vercel Blob storage adapter |
| `src/core/sync/adapters/resolve-adapter.ts` | Reads `SYNC_STORAGE` env var, returns adapter |
| `src/stores/sync-store.ts` | Zustand store: `enableSync`, `push`, `pull`, `scheduleSyncPush` |
| `server.ts` | Hono standalone server |
| `api/sync.ts` | Vercel serverless wrapper (pre-bundled during build, ADR 007) |

### Tests

| File | Coverage |
|------|----------|
| `tests/utils/base64.test.ts` | Round-trip encoding |
| `tests/core/sync/vault-crypto.test.ts` | Determinism, hex format, encrypt/decrypt, wrong-key failure |
| `tests/core/sync/sync-service.test.ts` | Export, import, push, pull with mocked fetch |
| `tests/core/sync/sync-handler.test.ts` | GET/PUT validation, 404/400/413 errors |
| `tests/core/sync/adapters/memory-adapter.test.ts` | CRUD operations |
| `tests/core/sync/adapters/filesystem-adapter.test.ts` | File I/O, directory creation, path traversal |
| `tests/stores/sync-store.test.ts` | State transitions, debounce, localStorage persistence |
| `tests/server.test.ts` | Hono app route mounting |
| `tests/app.test.tsx` | Sync-aware initialization |

## Design Decisions

- **Deterministic salt derivation** — The passphrase alone is sufficient to derive both vault ID and encryption key. No external state needed on new devices.
- **Vault ID and encryption key are cryptographically independent** — Different PBKDF2 salts ensure the server-side lookup key reveals nothing about the encryption key.
- **Passphrase in localStorage** — Accepted trade-off. Threat model is zero-knowledge server, not physical device security.
- **Full-state sync, last-write-wins** — Entire vault uploaded/downloaded as one blob. Acceptable for Phase 1.
- **Storage adapter pattern** — Vendor-neutral. Default is filesystem for self-hosting; Vercel Blob is opt-in.
- **Hono standalone server** — 14kB Web standard framework. Runs on Node, Deno, Bun. Same `Request/Response` API as handlers.

## Limitations

- No conflict resolution — last push wins
- No incremental sync — full vault transferred each time
- Vault size limited to 5MB
- No passphrase change/rotation flow yet
