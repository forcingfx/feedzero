import { describe, it, expect } from "vitest";
import {
  deriveKey,
  deriveBytes,
  generateSalt,
  encrypt,
  decrypt,
} from "../../../src/core/storage/crypto.ts";
import { isOk, isErr, unwrap } from "../../../src/utils/result.ts";

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
});
