import { describe, it, expect } from "vitest";
import {
  deriveVaultId,
  deriveEncryptionSalt,
  deriveVaultKey,
  encryptVault,
  decryptVault,
  readKdfSpec,
  LEGACY_KDF_SPEC,
} from "@/core/sync/vault-crypto";
import { isOk, isErr, unwrap } from "@feedzero/core/utils/result";
import { SYNC } from "@feedzero/core/utils/constants";
import type { VaultData, KdfSpec } from "@/core/sync/types";

function makeVault(overrides: Partial<VaultData> = {}): VaultData {
  return {
    version: 1,
    exportedAt: Date.now(),
    feeds: [
      {
        id: "f1",
        url: "https://example.com/feed.xml",
        title: "Example Feed",
        description: "A test feed",
        siteUrl: "https://example.com",
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
    articles: [
      {
        id: "a1",
        feedId: "f1",
        guid: "guid-1",
        title: "First Post",
        link: "https://example.com/post-1",
        content: "<p>Hello world</p>",
        summary: "Hello",
        author: "Alice",
        publishedAt: 2000,
        read: false,
        createdAt: 2000,
      },
    ],
    ...overrides,
  };
}

describe("vault-crypto", () => {
  describe("deriveVaultId", () => {
    it("produces a 64-character hex string", async () => {
      const result = await deriveVaultId("carbon mango velvet prism");
      expect(isOk(result)).toBe(true);
      const vaultId = unwrap(result);
      expect(vaultId).toHaveLength(64);
      expect(vaultId).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic — same passphrase always produces same ID", async () => {
      const a = unwrap(await deriveVaultId("carbon mango velvet prism"));
      const b = unwrap(await deriveVaultId("carbon mango velvet prism"));
      expect(a).toBe(b);
    });

    it("produces different IDs for different passphrases", async () => {
      const a = unwrap(await deriveVaultId("carbon mango velvet prism"));
      const b = unwrap(await deriveVaultId("trophy beacon lunar frost"));
      expect(a).not.toBe(b);
    });
  });

  describe("deriveEncryptionSalt", () => {
    it("produces a 16-byte Uint8Array", async () => {
      const result = await deriveEncryptionSalt("carbon mango velvet prism");
      expect(isOk(result)).toBe(true);
      const salt = unwrap(result);
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(16);
    });

    it("is deterministic", async () => {
      const a = unwrap(await deriveEncryptionSalt("carbon mango velvet prism"));
      const b = unwrap(await deriveEncryptionSalt("carbon mango velvet prism"));
      expect(Array.from(a)).toEqual(Array.from(b));
    });
  });

  describe("deriveVaultKey", () => {
    it("produces a CryptoKey", async () => {
      const result = await deriveVaultKey("carbon mango velvet prism");
      expect(isOk(result)).toBe(true);
      const key = unwrap(result);
      expect(key.type).toBe("secret");
      expect(key.algorithm.name).toBe("AES-GCM");
    });

    it("is deterministic — same passphrase produces interchangeable keys", async () => {
      const key1 = unwrap(await deriveVaultKey("carbon mango velvet prism"));
      const key2 = unwrap(await deriveVaultKey("carbon mango velvet prism"));
      const vault = makeVault();
      const encrypted = unwrap(await encryptVault(key1, vault));
      const decrypted = await decryptVault(key2, encrypted);
      expect(isOk(decrypted)).toBe(true);
      expect(unwrap(decrypted).feeds[0].title).toBe("Example Feed");
    });

    it("defaults to the legacy PBKDF2 KDF when no spec is given", async () => {
      // Locks in that pre-existing callers (no spec arg) keep PBKDF2 —
      // any silent switch to Argon2id here would mean a primary-device
      // user's stored JWK no longer matches what `deriveVaultKey`
      // produces on a passphrase re-entry, breaking recovery.
      const legacy = unwrap(await deriveVaultKey("carbon mango velvet prism"));
      const explicit = unwrap(
        await deriveVaultKey("carbon mango velvet prism", {
          kdfSpec: LEGACY_KDF_SPEC,
        }),
      );
      const encrypted = unwrap(await encryptVault(legacy, makeVault()));
      const decrypted = await decryptVault(explicit, encrypted);
      expect(isOk(decrypted)).toBe(true);
    });

    it("derives via Argon2id when given an argon2id spec", async () => {
      const spec: KdfSpec = {
        kind: "argon2id",
        memoryKib: 256,
        iterations: 1,
        parallelism: 1,
      };
      const key = unwrap(
        await deriveVaultKey("carbon mango velvet prism", { kdfSpec: spec }),
      );
      const sameKey = unwrap(
        await deriveVaultKey("carbon mango velvet prism", { kdfSpec: spec }),
      );
      const vault = makeVault();
      const encrypted = unwrap(await encryptVault(key, vault, spec));
      const decrypted = unwrap(await decryptVault(sameKey, encrypted));
      expect(decrypted.feeds[0].title).toBe("Example Feed");
      expect(encrypted.kdf).toEqual(spec);
    });

    it("Argon2id and PBKDF2 keys are NOT interchangeable for the same passphrase", async () => {
      const argon = unwrap(
        await deriveVaultKey("carbon mango velvet prism", {
          kdfSpec: {
            kind: "argon2id",
            memoryKib: 256,
            iterations: 1,
            parallelism: 1,
          },
        }),
      );
      const pbkdf2 = unwrap(await deriveVaultKey("carbon mango velvet prism"));
      const encrypted = unwrap(await encryptVault(argon, makeVault()));
      const decrypted = await decryptVault(pbkdf2, encrypted);
      expect(isErr(decrypted)).toBe(true);
    });
  });

  describe("encryptVault / decryptVault", () => {
    it("round-trips vault data with feeds and articles", async () => {
      const key = unwrap(await deriveVaultKey("carbon mango velvet prism"));
      const vault = makeVault();
      const encrypted = unwrap(await encryptVault(key, vault));
      const decrypted = unwrap(await decryptVault(key, encrypted));
      expect(decrypted.version).toBe(vault.version);
      expect(decrypted.feeds).toEqual(vault.feeds);
      expect(decrypted.articles).toEqual(vault.articles);
    });

    it("round-trips an empty vault", async () => {
      const key = unwrap(await deriveVaultKey("carbon mango velvet prism"));
      const vault = makeVault({ feeds: [], articles: [] });
      const encrypted = unwrap(await encryptVault(key, vault));
      const decrypted = unwrap(await decryptVault(key, encrypted));
      expect(decrypted.feeds).toEqual([]);
      expect(decrypted.articles).toEqual([]);
    });

    it("encrypted vault has the expected shape", async () => {
      const key = unwrap(await deriveVaultKey("carbon mango velvet prism"));
      const encrypted = unwrap(await encryptVault(key, makeVault()));
      expect(encrypted.version).toBe(SYNC.FORMAT_VERSION);
      expect(Array.isArray(encrypted.iv)).toBe(true);
      expect(encrypted.iv.length).toBe(12);
      expect(typeof encrypted.ciphertext).toBe("string");
    });

    it("fails to decrypt with a different passphrase", async () => {
      const key1 = unwrap(await deriveVaultKey("carbon mango velvet prism"));
      const key2 = unwrap(await deriveVaultKey("trophy beacon lunar frost"));
      const encrypted = unwrap(await encryptVault(key1, makeVault()));
      const result = await decryptVault(key2, encrypted);
      expect(isErr(result)).toBe(true);
    });

    it("compresses before encrypting (v4) — payload smaller than raw JSON for a repetitive vault", async () => {
      // A vault stuffed with repetitive content compresses very well;
      // the test asserts the ciphertext is meaningfully smaller than
      // the raw JSON would be. This locks in the compress-before-
      // encrypt invariant — once it lands, removing compression would
      // make this fail loudly.
      const key = unwrap(await deriveVaultKey("carbon mango velvet prism"));
      const repetitiveBody = "Lorem ipsum dolor sit amet, ".repeat(2000);
      const vault = makeVault({
        articles: Array.from({ length: 20 }, (_, i) => ({
          id: `a${i}`,
          feedId: "f1",
          guid: `g${i}`,
          title: `Title ${i}`,
          link: `https://example.com/${i}`,
          content: repetitiveBody,
          summary: repetitiveBody.slice(0, 200),
          author: "Author",
          publishedAt: 1700000000000 + i,
          read: false,
          createdAt: 1700000000000,
        })),
      });
      const encrypted = unwrap(await encryptVault(key, vault));
      expect(encrypted.version).toBeGreaterThanOrEqual(4);
      // Decoded base64 → cipher bytes; compare against the raw JSON byte length.
      const cipherBytes = atob(encrypted.ciphertext).length;
      const rawBytes = new TextEncoder().encode(JSON.stringify(vault)).length;
      expect(cipherBytes).toBeLessThan(rawBytes * 0.5);
    });

    it("decrypts a v3 (plaintext-then-encrypt) vault for back-compat", async () => {
      // Forge a v3 vault by encrypting the JSON directly (the old shape).
      // The decryptor must detect the version and skip the gunzip step.
      const key = unwrap(await deriveVaultKey("carbon mango velvet prism"));
      const vault = makeVault();
      const plaintext = new TextEncoder().encode(JSON.stringify(vault));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: iv as BufferSource },
          key,
          plaintext as BufferSource,
        ),
      );
      let bin = "";
      for (const b of ct) bin += String.fromCharCode(b);
      const v3Encrypted = {
        version: 3,
        iv: Array.from(iv),
        ciphertext: btoa(bin),
      };

      const decrypted = unwrap(await decryptVault(key, v3Encrypted));
      expect(decrypted.feeds).toEqual(vault.feeds);
      expect(decrypted.articles).toEqual(vault.articles);
    });
  });

  describe("KDF spec on the envelope", () => {
    it("encryptVault omits the kdf field when no spec is provided (back-compat)", async () => {
      const key = unwrap(await deriveVaultKey("carbon mango velvet prism"));
      const encrypted = unwrap(await encryptVault(key, makeVault()));
      expect("kdf" in encrypted).toBe(false);
    });

    it("encryptVault stamps the kdf field when a spec is provided", async () => {
      const key = unwrap(await deriveVaultKey("carbon mango velvet prism"));
      const spec: KdfSpec = {
        kind: "argon2id",
        memoryKib: 65536,
        iterations: 3,
        parallelism: 1,
      };
      const encrypted = unwrap(
        await encryptVault(key, makeVault(), spec),
      );
      expect(encrypted.kdf).toEqual(spec);
    });

    it("decryptVault still works on envelopes missing the kdf field", async () => {
      // Decryption never reads the kdf field — the field is metadata for
      // the recovery flow only. This locks in that legacy envelopes
      // continue to decrypt without any code path change.
      const key = unwrap(await deriveVaultKey("carbon mango velvet prism"));
      const vault = makeVault();
      const encrypted = unwrap(await encryptVault(key, vault));
      const decrypted = unwrap(await decryptVault(key, encrypted));
      expect(decrypted.feeds).toEqual(vault.feeds);
    });

    it("decryptVault works on envelopes that DO carry a kdf field", async () => {
      const key = unwrap(await deriveVaultKey("carbon mango velvet prism"));
      const vault = makeVault();
      const encrypted = unwrap(
        await encryptVault(key, vault, {
          kind: "argon2id",
          memoryKib: 256,
          iterations: 1,
          parallelism: 1,
        }),
      );
      const decrypted = unwrap(await decryptVault(key, encrypted));
      expect(decrypted.feeds).toEqual(vault.feeds);
    });

    it("readKdfSpec returns the legacy PBKDF2 default for envelopes without a kdf field", () => {
      const envelope = {
        version: SYNC.FORMAT_VERSION,
        iv: [],
        ciphertext: "",
      };
      expect(readKdfSpec(envelope)).toEqual(LEGACY_KDF_SPEC);
      expect(LEGACY_KDF_SPEC).toEqual({ kind: "pbkdf2-600k" });
    });

    it("readKdfSpec returns the stamped spec when present", () => {
      const spec: KdfSpec = {
        kind: "argon2id",
        memoryKib: 65536,
        iterations: 3,
        parallelism: 1,
      };
      const envelope = {
        version: SYNC.FORMAT_VERSION,
        iv: [],
        ciphertext: "",
        kdf: spec,
      };
      expect(readKdfSpec(envelope)).toEqual(spec);
    });
  });

  describe("vault ID and encryption key are independent", () => {
    it("vault ID does not reveal information about the encryption key", async () => {
      const passphrase = "carbon mango velvet prism";
      const vaultId = unwrap(await deriveVaultId(passphrase));
      const salt = unwrap(await deriveEncryptionSalt(passphrase));

      // The vault ID (hex string) and encryption salt (bytes) should differ
      const vaultIdBytes = new Uint8Array(
        (vaultId.match(/.{2}/g) || []).map((h) => parseInt(h, 16)),
      );
      // First 16 bytes of vault ID should not equal the encryption salt
      expect(Array.from(vaultIdBytes.slice(0, 16))).not.toEqual(
        Array.from(salt),
      );
    });
  });
});
