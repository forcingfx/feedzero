import { describe, it, expect } from "vitest";
import {
  deriveArgon2idKey,
  ARGON2ID_TEST_PARAMS,
} from "@/core/crypto/argon2";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function encryptString(key: CryptoKey, plaintext: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    encoder.encode(plaintext) as BufferSource,
  );
  return { iv, ct: new Uint8Array(ct) };
}

async function decryptString(
  key: CryptoKey,
  iv: Uint8Array,
  ct: Uint8Array,
): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return decoder.decode(pt);
}

describe("deriveArgon2idKey", () => {
  const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

  it("derives an AES-GCM CryptoKey from a passphrase", async () => {
    const result = await deriveArgon2idKey(
      "correct horse battery staple",
      salt,
      ARGON2ID_TEST_PARAMS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.algorithm).toMatchObject({ name: "AES-GCM" });
  });

  it("same passphrase + salt + params produces an equivalent key", async () => {
    const a = await deriveArgon2idKey("rosebud", salt, ARGON2ID_TEST_PARAMS);
    const b = await deriveArgon2idKey("rosebud", salt, ARGON2ID_TEST_PARAMS);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    const { iv, ct } = await encryptString(a.value, "the package is in the lobby");
    const plaintext = await decryptString(b.value, iv, ct);
    expect(plaintext).toBe("the package is in the lobby");
  });

  it("different passphrases produce non-interchangeable keys", async () => {
    const a = await deriveArgon2idKey("alpha", salt, ARGON2ID_TEST_PARAMS);
    const b = await deriveArgon2idKey("bravo", salt, ARGON2ID_TEST_PARAMS);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    const { iv, ct } = await encryptString(a.value, "secret");
    await expect(decryptString(b.value, iv, ct)).rejects.toThrow();
  });

  it("different salts produce non-interchangeable keys", async () => {
    const saltA = new Uint8Array(16).fill(1);
    const saltB = new Uint8Array(16).fill(2);
    const a = await deriveArgon2idKey("rosebud", saltA, ARGON2ID_TEST_PARAMS);
    const b = await deriveArgon2idKey("rosebud", saltB, ARGON2ID_TEST_PARAMS);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    const { iv, ct } = await encryptString(a.value, "secret");
    await expect(decryptString(b.value, iv, ct)).rejects.toThrow();
  });

  it("respects the extractable flag (default: non-extractable)", async () => {
    const nonExtractable = await deriveArgon2idKey(
      "rosebud",
      salt,
      ARGON2ID_TEST_PARAMS,
    );
    expect(nonExtractable.ok).toBe(true);
    if (!nonExtractable.ok) return;
    await expect(
      crypto.subtle.exportKey("raw", nonExtractable.value),
    ).rejects.toThrow();

    const extractable = await deriveArgon2idKey(
      "rosebud",
      salt,
      ARGON2ID_TEST_PARAMS,
      { extractable: true },
    );
    expect(extractable.ok).toBe(true);
    if (!extractable.ok) return;
    const raw = await crypto.subtle.exportKey("raw", extractable.value);
    expect(raw.byteLength).toBe(32);
  });
});
