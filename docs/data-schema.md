# Data Schema

## Version: 2

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
| publishedAt | number  | Unix ms timestamp (indexed), nullable |
| read        | boolean | Read status, default false          |
| createdAt   | number  | Unix ms timestamp                   |

### Meta (internal)

| Field | Type   | Description          |
|-------|--------|----------------------|
| key   | string | Primary key          |
| value | any    | Stored value (e.g., salt) |

### IndexedDB Stores

- `feeds` — keyPath: `id`, index: `url` (unique)
- `articles` — keyPath: `id`, indexes: `feedId`, `publishedAt`, `[feedId+guid]` (compound)
- `meta` — keyPath: `key`

### Encryption at Rest

Feed and Article content is encrypted. Index fields are stored in plaintext for Dexie queries. The actual IndexedDB record structure is:

```json
{ "id": "uuid", "iv": [12 bytes], "ciphertext": [encrypted JSON], "url": "...", "feedId": "...", "publishedAt": 123 }
```

Only `url`, `feedId`, `guid`, and `publishedAt` are plaintext (for indexing). All other fields (title, content, author, etc.) are inside the encrypted blob.

The `meta` store is unencrypted (stores encryption salt).

### Migration Strategy

Schema migrations are handled by Dexie's `version().stores()` API in `db.js`.
