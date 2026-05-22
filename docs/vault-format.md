# Vault Format

This document describes FeedZero's encrypted vault format in enough detail that you could implement an independent reader, exporter, or auditor — without our code, without our help, and without our permission.

That's the point. "Exit cost is zero" is one of FeedZero's structural commitments (see [docs/strategy/003-playing-to-win.md](./strategy/003-playing-to-win.md) §3 — How to Win). This page is how we keep it honest.

## Trust model in one paragraph

Your passphrase never leaves your browser. From it we derive — independently — a **vault ID** (a 64-character hex string the server uses to address your blob) and a **vault key** (an AES-GCM-256 key the server never sees). The server stores `(vault ID → encrypted blob)`. Without the passphrase, the server holds opaque ciphertext addressed by an opaque ID. With the passphrase, you can decrypt your vault on any device — or with any compatible implementation you write yourself.

## Key derivation

All derivations are PBKDF2-HMAC-SHA-256 with **600,000 iterations** (`CRYPTO.PBKDF2_ITERATIONS` in `src/utils/constants.ts`). Inputs are UTF-8 encoded.

### Vault ID

```
salt   = utf8("feedzero:vault-id:v1")          // SYNC.VAULT_ID_SALT
length = 32 bytes
bits   = PBKDF2-HMAC-SHA-256(passphrase, salt, iterations=600_000, length=256)
vault_id_hex = lowercase hex string of bits    // 64 characters
```

### Encryption salt

A deterministic salt derived for domain separation from the vault ID derivation:

```
salt   = utf8("feedzero:enc-salt:v1")          // SYNC.ENCRYPTION_SALT_SEED
length = 16 bytes
encryption_salt = PBKDF2-HMAC-SHA-256(passphrase, salt, iterations=600_000, length=128)
```

### Vault key

The AES-GCM-256 key that encrypts the vault payload:

```
vault_key = PBKDF2-HMAC-SHA-256(
  passphrase,
  encryption_salt,                             // from above
  iterations = 600_000,
  length     = 256
)
algorithm = AES-GCM
key_length = 256 bits
```

The three derivations are independent: knowing the vault ID does not reveal the encryption salt, and knowing the encryption salt does not reveal the vault key. Domain separation is achieved by distinct PBKDF2 salts (`"feedzero:vault-id:v1"` vs `"feedzero:enc-salt:v1"`).

Reference: `src/core/sync/vault-crypto.ts` (`deriveVaultId`, `deriveEncryptionSalt`, `deriveVaultKey`).

## Vault payload

The **plaintext** vault, before encryption, is UTF-8 JSON conforming to this shape:

```ts
interface VaultData {
  version: number;                 // SYNC.FORMAT_VERSION — currently 3 (informational)
  exportedAt: number;              // unix epoch ms when the vault was packed
  feeds: Feed[];                   // every feed in the vault
  articles: Article[];             // every article in the vault
  folders?: Folder[];              // v2+; omitted = "no opinion" (don't wipe local)
  smartFilters?: SmartFilter[];    // v2+; omitted = "no opinion"
  preferences?: UserPreferences;   // v3+; scalar settings, timestamp LWW
  preferencesUpdatedAt?: number;   // v3+; epoch ms of last preferences write
}

interface Feed {
  id: string;                      // UUID
  url: string;                     // canonical normalized feed URL
  title: string;
  description: string;
  siteUrl: string;
  folderId?: string;               // optional — null/undefined = unfiled
  createdAt: number;               // unix epoch ms
  updatedAt: number;               // unix epoch ms
  lastFetchedAt?: number;          // unix epoch ms, last refresh attempt
  lastSuccessfulFetchAt?: number;  // unix epoch ms, last refresh that returned 2xx
}

interface Article {
  id: string;                      // UUID
  feedId: string;                  // foreign key to Feed.id
  guid: string;                    // upstream GUID, falls back to link
  title: string;
  link: string;
  content: string;                 // HTML, sanitized before storage
  summary: string;                 // plaintext or sanitized HTML
  author: string;
  publishedAt: number;             // unix epoch ms
  read: boolean;
  createdAt: number;               // unix epoch ms when first stored locally
}
```

## Encryption

```
plaintext      = utf8(JSON.stringify(VaultData))
iv             = 12 random bytes                       // CRYPTO.IV_LENGTH
ciphertext_aes = AES-GCM-256.encrypt(vault_key, iv, plaintext)
                  // includes the 16-byte GCM auth tag appended per WebCrypto's
                  // ArrayBuffer convention
```

The wire format (what the server actually stores at `/api/sync` for `vaultId`) is JSON:

```ts
interface EncryptedVault {
  version: number;                 // SYNC.FORMAT_VERSION — currently 1
  iv: number[];                    // 12 bytes, expressed as decimal byte array
  ciphertext: string;              // base64-encoded ciphertext+tag
}
```

`iv` is serialized as a JSON array of integers (not base64) for historical reasons; both server and client read/write it as `Array.from(uint8)` / `new Uint8Array(arr)`.

Reference: `src/core/sync/vault-crypto.ts` (`encryptVault`, `decryptVault`), `src/utils/base64.ts`.

## Decryption reference (≈30 lines)

```ts
import { uint8ArrayToBase64, base64ToUint8Array } from "./base64";

async function deriveBits(passphrase: string, salt: Uint8Array, bytes: number) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), "PBKDF2", false, ["deriveBits"],
  );
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
    material, bytes * 8,
  ));
}

export async function decryptVaultData(passphrase: string, blob: EncryptedVault) {
  const enc = new TextEncoder();
  const encSalt = await deriveBits(passphrase, enc.encode("feedzero:enc-salt:v1"), 16);
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: encSalt, iterations: 600_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true, ["decrypt"],
  );
  const plaintextBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(blob.iv) },
    key,
    base64ToUint8Array(blob.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintextBuf)) as VaultData;
}
```

That is sufficient to read any FeedZero vault, ours or yours. Versions 2 and 3 only **add optional** fields (`folders`/`smartFilters`, then `preferences`/`preferencesUpdatedAt`), so this decryptor keeps working unchanged — older readers simply ignore fields they don't know.

## Local IndexedDB encryption (different format)

The browser-local Dexie database uses a **different** key derivation and storage shape than the sync vault. This document covers only the sync vault — the format that travels over the network and lives on the server.

If you want to read the local Dexie database directly, see `src/core/storage/db.ts` and `src/core/storage/crypto.ts`. The short version: records are stored as `{ id, iv: number[], ciphertext: number[], <hashed index fields> }` using a per-database PBKDF2 salt (`meta.salt`) and HMAC-SHA-256-hashed index fields (so the server-equivalent could query by `url` without ever seeing plaintext URLs).

## Format versioning

`SYNC.FORMAT_VERSION` is incremented when the shape of `VaultData` changes. The current version is **3**. Bumps so far have been backward-compatible — they only add optional fields (v2: `folders`/`smartFilters`; v3: `preferences`/`preferencesUpdatedAt`) — so the field is informational and consumers must tolerate any shape rather than switching on it.

When we change the format we will:

1. Publish the new version in this document with a side-by-side diff.
2. Ship a client that reads both the old and new formats for at least one release.
3. Migrate on first push of the new client.

If you implement a third-party reader, branch on `EncryptedVault.version` and refuse to decrypt unknown versions rather than misinterpreting bytes.

## Things we deliberately do not do

- We do not store an HMAC over the ciphertext separate from the AES-GCM authentication tag. The GCM tag is sufficient for our integrity needs and adding a separate MAC adds key-management complexity for no security gain.
- We do not store any plaintext metadata server-side. The server holds `vaultId → opaque blob` and that's it. No created-at, no feed count, no user agent, no IP.
- We do not derive the vault ID from the encryption key. They are derived independently with domain-separated salts so a leak in one cannot trivially reveal the other.

## Audit

The cryptographic claims here are open to independent audit. The reference implementation is short (under 100 lines including comments), is exercised by the test suite in `tests/core/sync/`, and was reviewed during the audit captured in [docs/reports/audit-2026-03-22.md](./reports/audit-2026-03-22.md). Discrepancies between this document and the code are bugs in this document — report them at [github.com/forcingfx/feedzero/issues](https://github.com/forcingfx/feedzero/issues).
