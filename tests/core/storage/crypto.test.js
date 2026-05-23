import { describe, it, expect } from "vitest";
import {
  deriveKey,
  deriveBytes,
  deriveHmacKey,
  hmacIndex,
  generateSalt,
  encrypt,
  decrypt,
  exportCryptoKey,
  importCryptoKey,
} from "../../../src/core/storage/crypto.ts";
import { isOk, isErr, unwrap } from "@feedzero/core/utils/result";

describe("Crypto", () => {
  const passphrase = "test-passphrase-123";

  describe("generateSalt", () => {
    it("should return 16 bytes", () => {
      const salt = generateSalt();
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(16);
    });

    it("should produce unique salts", () => {
      const a = generateSalt();
      const b = generateSalt();
      expect(a).not.toEqual(b);
    });
  });

  describe("deriveKey", () => {
    it("should derive a CryptoKey from passphrase", async () => {
      const salt = generateSalt();
      const result = await deriveKey(passphrase, salt);
      expect(isOk(result)).toBe(true);
      const key = unwrap(result);
      expect(key.type).toBe("secret");
      expect(key.algorithm.name).toBe("AES-GCM");
    });

    it("should derive same key for same passphrase and salt", async () => {
      const salt = generateSalt();
      const r1 = await deriveKey(passphrase, salt);
      const r2 = await deriveKey(passphrase, salt);
      // Can't directly compare CryptoKeys, but we can verify both encrypt/decrypt same data
      const data = { test: true };
      const encrypted = unwrap(await encrypt(unwrap(r1), data));
      const decrypted = await decrypt(
        unwrap(r2),
        encrypted.iv,
        encrypted.ciphertext,
      );
      expect(isOk(decrypted)).toBe(true);
      expect(unwrap(decrypted)).toEqual(data);
    });

    it("should derive different keys for different passphrases", async () => {
      const salt = generateSalt();
      const k1 = unwrap(await deriveKey("pass-a", salt));
      const k2 = unwrap(await deriveKey("pass-b", salt));
      const data = { secret: "hello" };
      const encrypted = unwrap(await encrypt(k1, data));
      const result = await decrypt(k2, encrypted.iv, encrypted.ciphertext);
      expect(isErr(result)).toBe(true);
    });
  });

  describe("deriveBytes", () => {
    it("should return raw bytes of the requested length", async () => {
      const salt = generateSalt();
      const result = await deriveBytes(passphrase, salt, 32);
      expect(isOk(result)).toBe(true);
      const bytes = unwrap(result);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32);
    });

    it("should return different lengths when requested", async () => {
      const salt = generateSalt();
      const r16 = unwrap(await deriveBytes(passphrase, salt, 16));
      const r32 = unwrap(await deriveBytes(passphrase, salt, 32));
      expect(r16.length).toBe(16);
      expect(r32.length).toBe(32);
    });

    it("should produce the same output for the same inputs", async () => {
      const salt = generateSalt();
      const a = unwrap(await deriveBytes(passphrase, salt, 32));
      const b = unwrap(await deriveBytes(passphrase, salt, 32));
      expect(Array.from(a)).toEqual(Array.from(b));
    });

    it("should produce different output for different passphrases", async () => {
      const salt = generateSalt();
      const a = unwrap(await deriveBytes("phrase-a", salt, 32));
      const b = unwrap(await deriveBytes("phrase-b", salt, 32));
      expect(Array.from(a)).not.toEqual(Array.from(b));
    });

    it("should produce different output for different salts", async () => {
      const saltA = generateSalt();
      const saltB = generateSalt();
      const a = unwrap(await deriveBytes(passphrase, saltA, 32));
      const b = unwrap(await deriveBytes(passphrase, saltB, 32));
      expect(Array.from(a)).not.toEqual(Array.from(b));
    });
  });

  describe("encrypt / decrypt", () => {
    it("should round-trip data correctly", async () => {
      const salt = generateSalt();
      const key = unwrap(await deriveKey(passphrase, salt));
      const data = { title: "Test Feed", articles: [1, 2, 3] };

      const encResult = await encrypt(key, data);
      expect(isOk(encResult)).toBe(true);

      const { iv, ciphertext } = unwrap(encResult);
      expect(iv).toBeInstanceOf(Uint8Array);
      expect(ciphertext).toBeInstanceOf(Uint8Array);

      const decResult = await decrypt(key, iv, ciphertext);
      expect(isOk(decResult)).toBe(true);
      expect(unwrap(decResult)).toEqual(data);
    });

    it("should produce different ciphertext for same data (random IV)", async () => {
      const salt = generateSalt();
      const key = unwrap(await deriveKey(passphrase, salt));
      const data = "same data";

      const e1 = unwrap(await encrypt(key, data));
      const e2 = unwrap(await encrypt(key, data));
      expect(e1.iv).not.toEqual(e2.iv);
      expect(e1.ciphertext).not.toEqual(e2.ciphertext);
    });

    it("should fail to decrypt with tampered ciphertext", async () => {
      const salt = generateSalt();
      const key = unwrap(await deriveKey(passphrase, salt));
      const { iv, ciphertext } = unwrap(await encrypt(key, "secret"));

      ciphertext[0] ^= 0xff;
      const result = await decrypt(key, iv, ciphertext);
      expect(isErr(result)).toBe(true);
    });
  });

  describe("deriveHmacKey", () => {
    it("should derive an HMAC key from a passphrase", async () => {
      const result = await deriveHmacKey(passphrase);
      expect(isOk(result)).toBe(true);
      const key = unwrap(result);
      expect(key.type).toBe("secret");
      expect(key.algorithm.name).toBe("HMAC");
    });

    it("should derive the same key for the same passphrase", async () => {
      const k1 = unwrap(await deriveHmacKey(passphrase));
      const k2 = unwrap(await deriveHmacKey(passphrase));
      // Verify by hashing the same value — should produce identical output
      const h1 = await hmacIndex(k1, "test-value");
      const h2 = await hmacIndex(k2, "test-value");
      expect(h1).toBe(h2);
    });

    it("should derive different keys for different passphrases", async () => {
      const k1 = unwrap(await deriveHmacKey("pass-a"));
      const k2 = unwrap(await deriveHmacKey("pass-b"));
      const h1 = await hmacIndex(k1, "same-value");
      const h2 = await hmacIndex(k2, "same-value");
      expect(h1).not.toBe(h2);
    });
  });

  describe("hmacIndex", () => {
    it("should return a hex string", async () => {
      const key = unwrap(await deriveHmacKey(passphrase));
      const hash = await hmacIndex(key, "https://example.com/rss");
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it("should return a 64-character hex string (SHA-256)", async () => {
      const key = unwrap(await deriveHmacKey(passphrase));
      const hash = await hmacIndex(key, "test");
      expect(hash).toHaveLength(64);
    });

    it("should produce deterministic output for the same input", async () => {
      const key = unwrap(await deriveHmacKey(passphrase));
      const a = await hmacIndex(key, "https://example.com/rss");
      const b = await hmacIndex(key, "https://example.com/rss");
      expect(a).toBe(b);
    });

    it("should produce different output for different inputs", async () => {
      const key = unwrap(await deriveHmacKey(passphrase));
      const a = await hmacIndex(key, "https://a.com/rss");
      const b = await hmacIndex(key, "https://b.com/rss");
      expect(a).not.toBe(b);
    });

    it("should not contain the original value", async () => {
      const key = unwrap(await deriveHmacKey(passphrase));
      const url = "https://example.com/rss";
      const hash = await hmacIndex(key, url);
      expect(hash).not.toContain("example");
      expect(hash).not.toContain("rss");
    });
  });

  describe("exportCryptoKey / importCryptoKey", () => {
    it("should round-trip an AES-GCM key via JWK", async () => {
      const salt = generateSalt();
      const original = unwrap(
        await deriveKey(passphrase, salt, { extractable: true }),
      );
      const jwk = await exportCryptoKey(original);
      expect(jwk.kty).toBe("oct");

      const imported = await importCryptoKey(jwk, {
        name: "AES-GCM",
        length: 256,
      });
      // Verify the imported key can decrypt data encrypted by the original
      const data = { secret: "test" };
      const encrypted = unwrap(await encrypt(original, data));
      const decrypted = await decrypt(
        imported,
        encrypted.iv,
        encrypted.ciphertext,
      );
      expect(isOk(decrypted)).toBe(true);
      expect(unwrap(decrypted)).toEqual(data);
    });

    it("should round-trip an HMAC key via JWK", async () => {
      const original = unwrap(
        await deriveHmacKey(passphrase, { extractable: true }),
      );
      const jwk = await exportCryptoKey(original);
      expect(jwk.kty).toBe("oct");

      const imported = await importCryptoKey(jwk, {
        name: "HMAC",
        hash: "SHA-256",
      });
      // Verify the imported key produces the same HMAC
      const h1 = await hmacIndex(original, "test-value");
      const h2 = await hmacIndex(imported, "test-value");
      expect(h1).toBe(h2);
    });
  });

  describe("extractable key derivation", () => {
    it("should derive an extractable AES-GCM key when requested", async () => {
      const salt = generateSalt();
      const key = unwrap(
        await deriveKey(passphrase, salt, { extractable: true }),
      );
      expect(key.extractable).toBe(true);
    });

    it("should derive a non-extractable AES-GCM key by default", async () => {
      const salt = generateSalt();
      const key = unwrap(await deriveKey(passphrase, salt));
      expect(key.extractable).toBe(false);
    });

    it("should derive an extractable HMAC key when requested", async () => {
      const key = unwrap(
        await deriveHmacKey(passphrase, { extractable: true }),
      );
      expect(key.extractable).toBe(true);
    });

    it("should derive a non-extractable HMAC key by default", async () => {
      const key = unwrap(await deriveHmacKey(passphrase));
      expect(key.extractable).toBe(false);
    });
  });
});
