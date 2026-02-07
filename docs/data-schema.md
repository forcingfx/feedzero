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

#### Payload Size Padding

The sync push payload is padded to the nearest power-of-2 bucket size (64KB, 128KB, ..., up to 4MB max) using a random `_pad` field. This prevents an observer from inferring subscription count or activity from transfer sizes.
