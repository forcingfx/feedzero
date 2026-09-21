import { describe, it, expect } from "vitest";
import { isErr, isOk, unwrap } from "@feedzero/core/utils/result";
import {
  encodePushBody,
  decodePushBody,
  PUSH_ENCODING_HEADER,
  PUSH_ENCODING_GZIP,
} from "@/core/sync/vault-transport";

/**
 * Random base64, standing in for the AES-GCM ciphertext that dominates a
 * real push body. Incompressible except for the 6-bits-per-character
 * base64 expansion, which is exactly the overhead this transport exists
 * to claw back.
 */
function randomBase64(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length * 0.76));
  for (let i = 0; i < bytes.length; i += 32768) {
    crypto.getRandomValues(bytes.subarray(i, Math.min(i + 32768, bytes.length)));
  }
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).slice(0, length);
}

function vaultJson(ciphertextLength: number): string {
  return JSON.stringify({
    vaultId: "a".repeat(64),
    vault: { version: 4, iv: [1, 2, 3], ciphertext: randomBase64(ciphertextLength) },
  });
}

describe("vault transport", () => {
  it("round-trips a push body", async () => {
    const json = vaultJson(4096);
    const encoded = unwrap(await encodePushBody(json));
    const decoded = await decodePushBody(encoded, 1024 * 1024);
    expect(isOk(decoded)).toBe(true);
    expect(unwrap(decoded)).toBe(json);
  });

  it("puts a quarter of the body back", async () => {
    // Base64 spends 8 bits to carry 6. A vault is almost entirely base64
    // ciphertext, so the wire form should land near three quarters of the
    // JSON — the saving that decides whether a large vault syncs at all.
    const json = vaultJson(512 * 1024);
    const encoded = unwrap(await encodePushBody(json));
    expect(encoded.byteLength / json.length).toBeLessThan(0.8);
  });

  it("refuses a body that expands past the cap", async () => {
    // A decompression bomb: a small upload that unpacks into gigabytes.
    // The cap is the only thing standing between a hostile client and the
    // server's memory.
    const bomb = unwrap(await encodePushBody("x".repeat(2 * 1024 * 1024)));
    expect(bomb.byteLength).toBeLessThan(64 * 1024);

    const decoded = await decodePushBody(bomb, 256 * 1024);
    expect(isErr(decoded)).toBe(true);
  });

  it("returns err rather than throwing on a body that is not gzip", async () => {
    const decoded = await decodePushBody(
      new TextEncoder().encode("{\"vaultId\":\"nope\"}"),
      1024 * 1024,
    );
    expect(isErr(decoded)).toBe(true);
  });

  it("names the header the server dispatches on", () => {
    // Pinned because client and server agree on this string alone; a typo
    // on either side silently falls back to the uncompressed path.
    expect(PUSH_ENCODING_HEADER).toBe("x-feedzero-body-encoding");
    expect(PUSH_ENCODING_GZIP).toBe("gzip");
  });
});
