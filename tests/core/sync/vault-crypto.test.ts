import { describe, it, expect } from "vitest";
import {
  deriveVaultId,
  deriveEncryptionSalt,
  deriveVaultKey,
  encryptVault,
  decryptVault,
} from "@/core/sync/vault-crypto";
import { isOk, isErr, unwrap } from "@/utils/result";
import { SYNC } from "@/utils/constants";
import type { VaultData } from "@/core/sync/types";

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
