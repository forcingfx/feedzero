# Security

This document describes FeedZero's security architecture, threat model, and cryptographic design. It is intended for security auditors, self-hosters, and high-risk users who need to understand exactly what protections exist and where the boundaries are.

All claims are verifiable from source code. A [source reference table](#source-verification) is provided at the end.

---

## Reporting a Vulnerability

FeedZero is used by journalists, activists, and people living under surveillance. **FeedZero protects people. Act accordingly.** If you find something, please tell us privately — public disclosure of an unpatched flaw can cost real users their safety.

Two private reporting channels:

1. **GitHub Security Advisories (preferred):** https://github.com/forcingfx/feedzero/security/advisories/new
2. **Email:** `security@feedzero.app` (PGP key: TBD — until then, treat the channel as transit-encrypted only and avoid pasting sensitive PoC payloads)

Please **do not** open a public GitHub issue or discuss the issue on social media until a fix has shipped.

Include:
- A description of the vulnerability and its impact
- Steps to reproduce (or a minimal PoC)
- Affected versions if known
- Any suggested mitigation

We aim to acknowledge within 48 hours and to ship a fix within the disclosure timeline below.

### Disclosure timeline

- **Standard:** 90 days from initial report to public disclosure.
- **May extend** when user impact requires (e.g. coordinated disclosure with downstream packages, complex remediation, or active exploitation in the wild).
- We will credit reporters publicly when the fix ships, with your consent.

## Scope

The following are in scope for security reports:

| Area | Examples |
|------|----------|
| **Cryptographic issues** | Weak key derivation, IV reuse, encryption bypass |
| **XSS vulnerabilities** | Bypassing DOMPurify sanitization, script injection via feeds |
| **SSRF in proxy** | Bypassing private IP blocking, accessing internal resources via `/api/feed`, `/api/page`, or `/api/icon` |
| **Privacy leaks via the proxy** | Logging of feed URLs or user IPs, header leakage to upstream feed publishers |
| **Data leakage** | Unintended data exposure to server, logging of sensitive data |
| **Authentication bypass** | Accessing another user's encrypted vault |

The following are **out of scope**:

- Social engineering attacks
- Physical access attacks (if someone has your device, derived keys in localStorage can decrypt local data — but cannot recover the passphrase or access the cloud vault)
- Volumetric DDoS (mitigated at the edge by Cloudflare; please report to Cloudflare directly)
- Missing security headers below high severity, where no exploit path is demonstrated
- Issues in dependencies without a demonstrated exploit path in FeedZero

---

## Principles

FeedZero is used by journalists, activists, and people living under surveillance. Every design decision assumes a user's safety depends on it.

- **Encrypt everything at rest.** All feed and article data is AES-GCM-256 encrypted in IndexedDB. Index fields are HMAC-SHA256 hashed.
- **Zero knowledge sync.** The server stores only opaque encrypted blobs. It never sees plaintext, passphrases, or encryption keys.
- **No telemetry.** No analytics, crash reporting, tracking pixels, or third-party network calls. The only outbound requests are user-initiated feed fetches and optional sync.
- **Minimize trust.** The browser is the trust boundary. The proxy and sync server are untrusted intermediaries.

---

## Cryptographic Design

### Local Storage Encryption

All data in IndexedDB is encrypted before storage and decrypted after retrieval.

| Parameter | Value |
|-----------|-------|
| Algorithm | AES-GCM-256 (authenticated encryption) |
| Key derivation | PBKDF2-SHA256, 600,000 iterations |
| Key size | 256 bits |
| IV (nonce) | 12 bytes, randomly generated per encryption operation |
| Salt | 16 bytes, randomly generated per database instance, stored in `meta` table |
| Implementation | Web Crypto API (hardware-accelerated, no external libraries) |

AES-GCM provides both confidentiality and integrity via its authentication tag. A random IV per record prevents ciphertext correlation across records.

### Index Field Hashing

Queryable fields (feed URL, article feedId, article guid) are HMAC-SHA256 hashed before storage, using a dedicated HMAC key derived from the passphrase with a domain-separated salt (`feedzero:index-hmac:v1`). Dexie indexes operate on these hashes, enabling lookups without exposing plaintext in IndexedDB.

### Key Material Lifecycle

1. **Onboarding**: User passphrase is fed to PBKDF2, producing a DB encryption key and an HMAC key (plus vault keys for sync users). Keys are exported as JWK and stored in `localStorage` under `feedzero:derived-keys`.
2. **Passphrase discarded**: The raw passphrase is never persisted. After key derivation, it is discarded from memory.
3. **Subsequent sessions**: `openWithKeys()` imports JWKs directly. No passphrase re-entry needed on the same device.
4. **Local-only users**: A random per-user passphrase is generated at onboarding time. The derived keys are stored; the passphrase is discarded.

**Key-data coupling invariant**: Stored derived keys must always be able to decrypt local IndexedDB data. Only two operations may modify this coupling: `open(passphrase)` (derives fresh keys and re-opens the DB) and `importAll()` (clears and re-encrypts all data).

### Cloud Sync Encryption

```
                    User Passphrase (4 words, ~51.7 bits entropy)
                                    |
                    +---------------+---------------+
                    |                               |
                    v                               v
            +----------------+              +----------------+
            | PBKDF2         |              | PBKDF2         |
            | salt: "feedzero|              | salt: "feedzero|
            | :vault-id:v1"  |              | :enc-salt:v1"  |
            | iter: 600,000  |              | iter: 600,000  |
            | hash: SHA-256  |              | hash: SHA-256  |
            +-------+--------+              +-------+--------+
                    |                               |
                    v                               v
            +----------------+              +----------------+
            | Vault ID       |              | Encryption Salt|
            | (32 bytes,     |              | (16 bytes)     |
            | hex-encoded    |              |                |
            | = 64 chars)    |              +-------+--------+
            +----------------+                      |
                                                    v
                                            +----------------+
                                            | PBKDF2         |
                                            | salt: enc salt |
                                            | iter: 600,000  |
                                            +-------+--------+
                                                    |
                                                    v
                                            +----------------+
                                            | AES-GCM-256    |
                                            | Vault Key      |
                                            +----------------+
```

- **Vault ID** and **encryption key** are cryptographically independent (different PBKDF2 salts). The server-side lookup key reveals nothing about the encryption key.
- Same passphrase always produces the same vault ID and encryption key. No external state needed to recover on a new device.
- The server never receives the passphrase or encryption key. It only sees the vault ID and an opaque encrypted blob.

### Passphrase Generation

| Parameter | Value |
|-----------|-------|
| Wordlist | EFF large wordlist (7,776 words) |
| Word count | 4 words |
| Entropy | ~51.7 bits (log2(7776^4)) |
| Randomness | `crypto.getRandomValues()` with rejection sampling |
| Bias mitigation | Rejection sampling eliminates modulo bias from Uint32 → 7776 mapping |

### Sync Payload Padding

To prevent traffic analysis from inferring subscription count based on vault transfer size:

1. Vault serialized to JSON
2. Padded to next power-of-2 bucket size (minimum 64 KB, maximum 5 MB)
3. Padding is random hex in a `_pad` JSON field, generated via `crypto.getRandomValues()`
4. Random jitter (0-30 seconds) added after the 5-second sync debounce

---

## Threat Model

### What FeedZero protects against

| Threat | Mitigation |
|--------|------------|
| Server reading your feed list or articles | All data encrypted client-side before upload; server stores opaque blobs |
| Server correlating identity with feeds | Vault ID derived via PBKDF2 with different salt than encryption key; server cannot link vault to passphrase |
| XSS via malicious feed content | All HTML sanitized through DOMPurify with strict tag/attribute allowlist; CSP restricts script sources to `'self'` |
| Malicious feed URLs (SSRF) | Proxy blocks private IPs, IPv6-mapped addresses, localhost, link-local, AWS metadata endpoint |
| Passphrase theft from localStorage | Raw passphrase never persisted — only derived JWK key material stored |
| Feed URL logging by proxy | Proxy uses POST with JSON body; URLs never appear in query strings or server access logs |
| User IP leaked via favicons | Favicons proxied through the CORS proxy, not loaded directly from publisher servers |
| Timing analysis of sync patterns | 0-30s random jitter added after debounce; vault payloads padded to power-of-2 bucket sizes |
| IndexedDB metadata leakage | Index fields are HMAC-SHA256 hashed — deterministic for queries, non-reversible |
| User-Agent fingerprinting via proxy | Fixed `User-Agent: FeedZero/1.0 (RSS Reader)` on all outbound proxy requests |
| Data persistence after logout | "Delete all data" removes IndexedDB, all localStorage keys, and cloud vault blob |
| Clickjacking | `X-Frame-Options: DENY` and `frame-ancestors 'none'` in CSP |
| MIME sniffing attacks | `X-Content-Type-Options: nosniff` on all responses |
| Referrer leakage | `Referrer-Policy: no-referrer` prevents URL leakage to external sites |

### What FeedZero does NOT protect against

| Limitation | Explanation |
|------------|-------------|
| **Proxy operator sees feed URLs** | The CORS proxy must know which URLs to fetch. A malicious or compromised proxy operator can log every feed URL you subscribe to. Self-hosting mitigates this. |
| **DNS visibility** | Your ISP/network can see DNS queries for feed domains unless you use encrypted DNS (DoH/DoT). |
| **Feed server logs** | Feed publishers see requests from the proxy's IP, not yours. If you self-host the proxy, your IP is exposed to publishers. |
| **Stolen derived keys enable local decryption** | Derived JWK keys in localStorage can decrypt local IndexedDB data. However, they cannot recover the passphrase or access the cloud vault from another device. |
| **4-word passphrase offline brute-force** | 51.7 bits of entropy is strong against online attacks (rate-limited) but potentially vulnerable to offline brute-force if an attacker obtains your encrypted vault blob. 600,000 PBKDF2 iterations raise the cost significantly. |
| **No forward secrecy** | If your passphrase is compromised, all historical data encrypted with that passphrase is exposed. There is no key rotation flow yet. |
| **HMAC indices leak structural metadata** | HMAC hashes hide field values but reveal: number of feeds, articles per feed, growth patterns, subscription churn. Counts are observable in IndexedDB. |
| **Browser extension access** | A malicious extension with `tabs` or `activeTab` permission could read localStorage keys or intercept decrypted content in memory. |

---

## SSRF Protection

All proxy endpoints validate target URLs before fetching. The validation function (`validateProxyUrl`) enforces:

**Blocked hostnames** (exact match):
- `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`, `169.254.169.254`

**Blocked IP ranges**:
- `10.0.0.0/8` (RFC 1918)
- `172.16.0.0/12` (RFC 1918)
- `192.168.0.0/16` (RFC 1918)

**IPv6-mapped IPv4 detection**:
- Blocks `::ffff:x.x.x.x` (dotted-decimal form)
- Blocks `::ffff:XXXX:XXXX` (hex form) — parses and checks underlying IPv4

**Protocol whitelist**: Only `http:` and `https:` allowed. All other protocols (`file://`, `ftp://`, `gopher://`, etc.) rejected.

**Validation timing**: Runs before any fetch. Invalid URLs return 400; blocked addresses return 403.

---

## HTML Sanitization

All feed content and extracted page content passes through DOMPurify before rendering.

**Allowed tags** (40):
`p`, `br`, `hr`, `h1`–`h6`, `ul`, `ol`, `li`, `dl`, `dt`, `dd`, `strong`, `em`, `b`, `i`, `u`, `s`, `del`, `ins`, `mark`, `a`, `img`, `figure`, `figcaption`, `blockquote`, `pre`, `code`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `span`, `div`, `article`, `section`, `sup`, `sub`, `abbr`, `time`

**Allowed attributes**: `href`, `src`, `alt`, `title`, `datetime`, `colspan`, `rowspan`, `class`

**URI protocol restriction**: Explicit allowlist regex permits `http:`, `https:`, `mailto:`, `tel:`, relative URLs. Blocks `javascript:`, `vbscript:`, and other dangerous schemes.

**Link hardening**: All `<a>` tags forced to `target="_blank"` with `rel="noopener noreferrer"` via afterSanitizeAttributes hook (prevents tab-nabbing).

**Data attributes**: Blocked (`ALLOW_DATA_ATTR: false`).

---

## HTTP Security Headers

Applied to all non-API responses in both Vercel and Hono deployments:

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` |

API (sync) responses include `X-Content-Type-Options: nosniff` and `Content-Type: application/json`.

CSP note: `style-src 'unsafe-inline'` is required for Tailwind CSS v4's inline style generation. No user-controlled CSS is injected.

---

## Rate Limiting

The standalone Hono server applies a sliding-window rate limiter to all `/api/*` routes:

| Parameter | Value |
|-----------|-------|
| Window | 60 seconds |
| Max requests per IP | 100 |
| Response on exceed | HTTP 429 |
| IP source | `x-forwarded-for` header (first value) |

Vercel deployments should configure rate limiting at the edge (Vercel Firewall or a reverse proxy).

---

## Sync API Validation

| Check | Rule | Error |
|-------|------|-------|
| Vault ID format | Must match `/^[0-9a-f]{64}$/` | 400 |
| Vault ID presence | Required on all methods | 400 |
| Payload size | PUT body capped at 5 MB | 413 |
| JSON validity | Strict JSON parsing | 400 |
| HTTP method | GET, HEAD, PUT, DELETE only | 405 |

The sync endpoint returns `Access-Control-Allow-Origin: *` intentionally — vaults are encrypted and vault IDs are unguessable (64-char hex from PBKDF2, 2^128 possible values).

---

## Network Request Inventory

Complete list of all network requests FeedZero makes:

| Request | Trigger | Data Sent | Data Received |
|---------|---------|-----------|---------------|
| `POST /api/feed` | Adding/refreshing feed | `{ "url": "..." }` in body | Feed XML/JSON |
| `POST /api/page` | "Extract full text" button | `{ "url": "..." }` in body | Page HTML |
| `GET /api/icon?url=...` | Displaying feed favicon | Icon URL in query param | Icon image |
| `HEAD /api/sync?vaultId=<id>` | Checking if cloud vault exists | Vault ID | 200/404 status |
| `GET /api/sync?vaultId=<id>` | Pulling cloud data | Vault ID | Encrypted blob |
| `PUT /api/sync?vaultId=<id>` | Pushing local data to cloud | Vault ID + encrypted blob (padded) | Success/error |
| `DELETE /api/sync?vaultId=<id>` | Deleting cloud data | Vault ID | Success/error |
| `POST /api/feedback` | Submitting anonymous feedback | Feedback text | Success/error |

**No other network requests are made.** There is no analytics, no telemetry, no crash reporting, no third-party tracking, no CDN fonts, no external scripts.

---

## localStorage Contents

| Key | Value | Purpose |
|-----|-------|---------|
| `feedzero:onboarding-complete` | `"true"` or absent | Tracks if user completed onboarding |
| `feedzero:derived-keys` | JSON with JWK key material | Derived cryptographic keys (DB key, HMAC key, optionally vault key + vault ID) |
| `feedzero:sync-status` | `"local-only"` / `"synced"` | Current sync mode |

Raw passphrase is never stored. Derived JWK keys can decrypt local data but cannot recover the passphrase or access the cloud vault from another device.

---

## Database Encryption Schema

| Table | Key | Encrypted Fields | HMAC-Hashed Index Fields |
|-------|-----|-----------------|-------------------------|
| `feeds` | `id` | title, description, link, feedUrl, lastFetched, image, copyright, author, language, ttl, addedAt | `url` |
| `articles` | `id` | title, description, content, author, link, pubDate, addedAt, isRead, isStarred | `feedId`, `guid`, `[feedId+guid]` (compound) |
| `meta` | `key` | — (stores encryption salt in plaintext) | — |

---

## Third-Party Runtime Dependencies

| Dependency | Purpose | Privacy Impact |
|------------|---------|----------------|
| React, ReactDOM | UI framework | No network calls |
| Zustand | State management | No network calls |
| Dexie.js | IndexedDB wrapper | Local storage only |
| DOMPurify | HTML sanitization | Local processing only |
| Defuddle | Full-text extraction | Local processing only |
| marked | Markdown parsing | Local processing only |
| Hono | Server framework (self-host) | Processes proxy/sync requests |
| Radix UI | Accessible UI primitives | No network calls |
| lucide-react | Icons (bundled SVGs) | No network calls |

No dependency makes external network requests. All processing is local except explicit user-initiated proxy and sync operations.

---

## Recommendations for High-Risk Users

- **Self-host the proxy** to eliminate third-party URL logging
- **Use a longer passphrase** (6+ words) if you enable sync — 51.7 bits may be insufficient against well-resourced adversaries with offline access to your vault
- **Use encrypted DNS** (DoH/DoT) to hide feed domain lookups from your ISP/network
- **Use "Delete all data"** when leaving shared computers (removes IndexedDB, localStorage keys, and cloud vault)
- **Disable cloud sync** if you don't need cross-device access — this eliminates the vault as an attack surface entirely
- **Use a privacy-focused browser** to reduce extension-based attack surface

---

## Source Verification

| Claim | Source File |
|-------|-------------|
| AES-GCM-256 encryption, PBKDF2 key derivation | `src/core/storage/crypto.ts` |
| PBKDF2 iteration count (600,000) | `src/utils/constants.ts` |
| HMAC-SHA256 index hashing | `src/core/storage/crypto.ts`, `src/core/storage/db.ts` |
| Key derivation, JWK export/import | `src/core/storage/key-material.ts` |
| SSRF protection, URL validation | `src/core/proxy/validate-url.ts` |
| Proxy handler, User-Agent normalization | `src/core/proxy/proxy-handler.ts` |
| Vault ID/key derivation (PBKDF2 domain separation) | `src/core/sync/vault-crypto.ts` |
| Passphrase generation, rejection sampling | `src/core/crypto/passphrase-generator.ts` |
| DOMPurify sanitization config | `src/core/parser/sanitizer.ts` |
| CSP and security headers | `vercel.json`, `server.ts` |
| Favicon proxying | `src/components/feeds/feed-favicon.tsx` |
| Sync timing jitter | `src/stores/sync-store.ts` |
| Payload padding | `src/core/sync/sync-service.ts` |
| Sync handler validation | `src/core/sync/sync-handler.ts` |
| Rate limiting | `server.ts` |
| IndexedDB schema | `src/core/storage/db.ts` |
| Sync storage adapters | `src/core/sync/adapters/` |
