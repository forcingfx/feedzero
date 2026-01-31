# Architecture

## Overview

FeedZero is a privacy-first RSS reader built with vanilla JavaScript (ES modules) and Web Components. Uses targeted libraries for security-critical code: DOMPurify (sanitization) and Dexie.js (IndexedDB).

## Data Flow

```
User adds feed URL
      │
      ▼
  fetch(url) → XML response
      │
      ▼
  validator.js → Checks RSS 2.0 or Atom 1.0
      │
      ▼
  parser.js → Extracts feed metadata + articles
      │
      ▼
  sanitizer.js → DOMPurify strips dangerous HTML
      │
      ▼
  schema.js → Creates Feed/Article objects with UUIDs
      │
      ▼
  crypto.js → Encrypts with AES-GCM-256 (PBKDF2-derived key)
      │
      ▼
  db.js → Dexie stores encrypted blobs in IndexedDB
      │
      ▼
  Event bus emits feed:added → UI components re-render
```

## Module Dependency Graph

```
main.js
├── core/events/event-bus.js     (no deps)
├── core/storage/db.js
│   ├── dexie                    (npm)
│   ├── core/storage/crypto.js
│   │   └── utils/constants.js
│   └── core/storage/schema.js
│       └── utils/result.js
├── core/parser/parser.js
│   ├── core/parser/validator.js
│   └── core/parser/sanitizer.js
│       └── dompurify            (npm)
├── ui/components/feed-list.js
├── ui/components/article-list.js
├── ui/components/article-view.js
└── ui/components/keyboard-nav.js
```

## Component Communication

All components communicate through the event bus — no direct references between them. `main.js` is the only orchestrator that wires event handlers.

Events: `feed:added`, `feed:selected`, `feed:removed`, `feed:updated`, `article:selected`, `article:read`, `storage:ready`, `storage:error`, `parse:error`

## Encryption Model

- Passphrase → PBKDF2 (100k iterations, SHA-256) → AES-GCM-256 key
- Each record encrypted with random 12-byte IV
- Stored as `{id, iv, ciphertext, ...indexFields}` — content encrypted, index fields in plaintext for Dexie queries
- Key derived once on app open, held in memory, cleared on close

## Storage Model

Dexie.js manages IndexedDB with these stores:

- `feeds` — keyPath: `id`, unique index: `url`
- `articles` — keyPath: `id`, indexes: `feedId`, `publishedAt`
- `meta` — keyPath: `key` (stores encryption salt)

Schema migrations are handled by Dexie's `version().stores()` API.
