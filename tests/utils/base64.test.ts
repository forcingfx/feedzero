import { describe, it, expect } from "vitest";
import { uint8ArrayToBase64, base64ToUint8Array } from "@feedzero/core/utils/base64";

describe("base64", () => {
  describe("uint8ArrayToBase64", () => {
    it("encodes an empty array to an empty string", () => {
      expect(uint8ArrayToBase64(new Uint8Array([]))).toBe("");
    });

    it("encodes a known byte sequence", () => {
      // "Hello" in UTF-8 = [72, 101, 108, 108, 111]
      const bytes = new Uint8Array([72, 101, 108, 108, 111]);
      expect(uint8ArrayToBase64(bytes)).toBe("SGVsbG8=");
    });

    it("encodes binary data with bytes above 127", () => {
      const bytes = new Uint8Array([0, 128, 255]);
      const base64 = uint8ArrayToBase64(bytes);
      expect(typeof base64).toBe("string");
      expect(base64.length).toBeGreaterThan(0);
    });
  });

  describe("base64ToUint8Array", () => {
    it("decodes an empty string to an empty array", () => {
      const result = base64ToUint8Array("");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(0);
    });

    it("decodes a known base64 string", () => {
      const result = base64ToUint8Array("SGVsbG8=");
      expect(Array.from(result)).toEqual([72, 101, 108, 108, 111]);
    });
  });

  describe("round-trip", () => {
    it("preserves small binary data", () => {
      const original = new Uint8Array([1, 2, 3, 4, 5]);
      const roundTripped = base64ToUint8Array(uint8ArrayToBase64(original));
      expect(Array.from(roundTripped)).toEqual(Array.from(original));
    });

    it("preserves a full byte range (0–255)", () => {
      const original = new Uint8Array(256);
      for (let i = 0; i < 256; i++) original[i] = i;
      const roundTripped = base64ToUint8Array(uint8ArrayToBase64(original));
      expect(Array.from(roundTripped)).toEqual(Array.from(original));
    });

    it("preserves large data (10 KB of random bytes)", () => {
      const original = new Uint8Array(10240);
      crypto.getRandomValues(original);
      const roundTripped = base64ToUint8Array(uint8ArrayToBase64(original));
      expect(Array.from(roundTripped)).toEqual(Array.from(original));
    });
  });
});
