# Data Schema

## Version: 3

### Feed

| Field       | Type   | Description                         |
|-------------|--------|-------------------------------------|
| id          | string | UUID v4, primary key                |
| url         | string | Feed URL (unique index)             |
| title       | string | Feed title from source              |
| description | string | Feed description, default ''        |
| siteUrl     | string | Website URL, default ''             |
| createdAt   | number | Unix ms timestamp                   |
| updatedAt   | number | Unix ms timestamp                   |

Supported feed formats: RSS 2.0, Atom 1.0, JSON Feed 1.1.

### Article

| Field       | Type    | Description                        |
|-------------|---------|-------------------------------------|
| id          | string  | UUID v4, primary key                |
| feedId      | string  | Foreign key to Feed.id (indexed)    |
| guid        | string  | Unique article identifier, defaults to link |
| title       | string  | Article title                       |
| link        | string  | Original article URL                |
| content     | string  | Sanitized HTML content              |
| summary     | string  | Sanitized summary/description       |
| author      | string  | Author name, default ''             |
| publishedAt | number  | Unix ms timestamp, nullable           |
| read        | boolean | Read status, default false          |
| createdAt   | number  | Unix ms timestamp                   |

### Meta (internal)

| Field | Type   | Description          |
|-------|--------|----------------------|
| key   | string | Primary key          |
| value | any    | Stored value (e.g., salt) |

### IndexedDB Stores

- `feeds` — keyPath: `id`, index: `url` (unique)
- `articles` — keyPath: `id`, indexes: `feedId`, `[feedId+guid]` (compound)
- `meta` — keyPath: `key`

### Encryption at Rest

Feed and Article content is encrypted with AES-GCM-256. Index fields (`url`, `feedId`, `guid`) are HMAC-SHA256 hashed before storage so Dexie can query them without exposing plaintext values. The HMAC key is derived from the passphrase via PBKDF2 with a domain-separated static salt (`feedzero:index-hmac:v1`). The actual IndexedDB record structure is:

```json
{ "id": "uuid", "iv": [12 bytes], "ciphertext": [encrypted JSON], "url": "<hmac-hex>", "feedId": "<hmac-hex>", "guid": "<hmac-hex>" }
```

Index fields are 64-character hex HMAC hashes (deterministic, non-reversible). All other fields (title, content, author, etc.) are inside the encrypted blob.

The `meta` store is unencrypted (stores encryption salt).

### Migration Strategy

Schema migrations are handled by Dexie's `version().stores()` API in `db.js`.

### Sync Vault (server-side)

The sync server stores encrypted vault blobs. The server never sees plaintext.

#### VaultData (plaintext, client-side only)

| Field      | Type      | Description                          |
|------------|-----------|--------------------------------------|
| version    | number    | Format version (currently 1)         |
| exportedAt | number    | Unix ms timestamp of export          |
| feeds      | Feed[]    | All feeds                            |
| articles   | Article[] | All articles                         |

#### EncryptedVault (stored on server)

| Field      | Type     | Description                          |
|------------|----------|--------------------------------------|
| version    | number   | Format version (currently 1)         |
| iv         | number[] | 12-byte AES-GCM initialization vector|
| ciphertext | string   | Base64-encoded encrypted VaultData   |

Vault ID (64-char hex) is derived from the passphrase via PBKDF2 and used as the server-side lookup key. See [ADR 006](decisions/006-sync-storage-and-passphrase.md).

### Derived Key Storage (localStorage)

The raw passphrase is never persisted. At onboarding/login, all cryptographic material is derived from the passphrase and stored as JWK objects in `localStorage["feedzero:derived-keys"]`:

| Field        | Type       | Description                                   |
|--------------|------------|-----------------------------------------------|
| dbKeyJwk     | JsonWebKey | AES-GCM-256 key for IndexedDB encryption      |
| hmacKeyJwk   | JsonWebKey | HMAC-SHA256 key for index field hashing        |
| dbSalt       | number[]   | Salt used for DB key derivation                |
| vaultId      | string?    | Vault lookup ID (sync users only)              |
| vaultKeyJwk  | JsonWebKey?| AES-GCM-256 key for vault encryption (sync users only) |

On subsequent app loads, `openWithKeys()` imports JWKs directly — no passphrase needed. Legacy users with a stored passphrase are auto-migrated: keys are derived, stored, and the raw passphrase is removed.

Recovery still requires the original passphrase (re-derives all keys).

#### Payload Size Padding

The sync push payload is padded to the nearest power-of-2 bucket size (64KB, 128KB, ..., up to 4MB max) using a random `_pad` field. This prevents an observer from inferring subscription count or activity from transfer sizes.

## Upstash KV Keyspace (production server-side)

Per [ADR 008](decisions/008-upstash-as-production-data-layer.md), five server-side concerns share one Upstash REST KV instance with non-overlapping key prefixes. The cascade `UPSTASH_REDIS_REST_URL/TOKEN` → `KV_REST_API_URL/TOKEN` → memory fallback is shared by every adapter.

### License storage (`src/core/license/storage-upstash.ts`)

| Key | Type | Description |
|---|---|---|
| `license:record:<keyId>` | JSON `LicenseRecord` | One per issued license. Auto-deserialized by the SDK (we store objects directly). |
| `license:revoked:<keyId>` | string | Revocation reason. Presence = revoked. Write-only (no `unrevoke`). |
| `customer:<customerId>:keys` | Redis SET of keyIds | Secondary index. Enables O(records-per-customer) `listByCustomer` and `revokeAllForCustomer` without scanning the entire keyspace. |

### Sync vault storage (`src/core/sync/adapters/upstash-adapter.ts`)

| Key | Type | Description |
|---|---|---|
| `vault:<vaultId>` | JSON-string of `{ok, vault}` | The encrypted vault payload from the client. **The Upstash client for this adapter is constructed with `automaticDeserialization: false`** because the handler stores a string and reads a string — auto-parsing turns the string back into an object, which `new Response(obj)` then renders as `"[object Object]"`. Bug live for 24h in PR #45 before the smoke test caught it. See [2026-05-12 incident postmortem](incidents/2026-05-12-sync-regression.md). |

### Stripe event-id dedup (`src/core/stripe/seen-event-store.ts`)

| Key | Type | Description |
|---|---|---|
| `seen-event:<eventId>` | string (any value) | TTL = Stripe's 3-day retry window. Presence = "already processed". Prevents duplicate license issuance on Stripe webhook retries. |

### Anonymous feed catalog (`src/core/catalog/adapters/upstash-adapter.ts`)

| Key | Type | Description |
|---|---|---|
| `catalog:feed:<url>` | JSON `CatalogFeed` | One per known feed URL. Fields: `url`, `title`, `description`, `siteUrl`, `status`, `requestCount`, `lastRequestedAt`, `lastCrawledAt`, `errorCount`, `lastError`, `createdAt`. |
| `catalog:ranking` | Redis sorted set | Members = feed URLs, scores = `requestCount`. Enables O(log N) inserts and O(top-K + MGET) reads for `popular()`. `count()` is O(1) via `ZCARD`. |

### Proxy rate-limit counters (`src/core/proxy/rate-limiter.ts`)

| Key | Type | Description |
|---|---|---|
| `ratelimit:cli_<8-hex>` | integer counter (INCR) | TTL = window length (default 60s). `cli_<8-hex>` is SHA-256 of `${ip}|${userAgent}|${salt}` truncated to first 4 bytes. The salt is `RATE_LIMIT_HASH_SALT` (fallback `LICENSE_SIGNING_KEY`). See [ADR 010](decisions/010-proxy-rate-limiter.md). |

### Anonymity floor across all server-side keyspaces

No raw IPs, User-Agents, emails, license token contents, vault ciphertext, or Stripe payload bodies are ever persisted to any Upstash key. Vault payloads are client-encrypted blobs; license records carry only `keyId` (random) + `customerId` (Stripe-scoped opaque); rate-limit keys are salted SHA-256 hashes that auto-expire after 60s. Same floor applies to the structured error log (see [ADR 009](decisions/009-observability-trace-id-pattern.md)).
