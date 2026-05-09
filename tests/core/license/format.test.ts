import { describe, it, expect } from "vitest";
import {
  encodeLicensePayload,
  decodeLicensePayload,
  type LicensePayload,
} from "@/core/license/format";

const validPayload: LicensePayload = {
  tier: "pro",
  expirySec: 1_800_000_000,
  customerId: "cus_NQpJjB7ehjf2QH",
  keyId: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  issuedAtSec: 1_700_000_000,
};

describe("license format — encodeLicensePayload", () => {
  it("encodes a payload as v1:tier:exp:cid:kid:iat (colon-joined string)", () => {
    expect(encodeLicensePayload(validPayload)).toBe(
      "v1:pro:1800000000:cus_NQpJjB7ehjf2QH:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6:1700000000",
    );
  });

  it("encodes each tier verbatim", () => {
    expect(encodeLicensePayload({ ...validPayload, tier: "free" })).toContain(":free:");
    expect(encodeLicensePayload({ ...validPayload, tier: "personal" })).toContain(":personal:");
    expect(encodeLicensePayload({ ...validPayload, tier: "pro" })).toContain(":pro:");
  });

  it("rejects payloads with colons in customerId (would corrupt the format)", () => {
    expect(() =>
      encodeLicensePayload({ ...validPayload, customerId: "cus_with:colon" }),
    ).toThrowError(/colon/i);
  });

  it("rejects payloads with colons in keyId", () => {
    expect(() =>
      encodeLicensePayload({ ...validPayload, keyId: "key:with:colons" }),
    ).toThrowError(/colon/i);
  });
});

describe("license format — decodeLicensePayload", () => {
  it("round-trips an encoded payload", () => {
    const encoded = encodeLicensePayload(validPayload);
    const result = decodeLicensePayload(encoded);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(validPayload);
  });

  it("returns err for an unknown version", () => {
    const result = decodeLicensePayload(
      "v2:pro:1800000000:cus_x:abc:1700000000",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/version/i);
  });

  it("returns err for a malformed payload (wrong field count)", () => {
    const result = decodeLicensePayload("v1:pro:1800000000:cus_x:abc");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/format|fields/i);
  });

  it("returns err for an unknown tier", () => {
    const result = decodeLicensePayload(
      "v1:enterprise:1800000000:cus_x:abc:1700000000",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/tier/i);
  });

  it("returns err for a non-numeric expiry", () => {
    const result = decodeLicensePayload(
      "v1:pro:not-a-number:cus_x:abc:1700000000",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/expiry|number/i);
  });

  it("returns err for a non-numeric issuedAt", () => {
    const result = decodeLicensePayload(
      "v1:pro:1800000000:cus_x:abc:not-a-number",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/issued|number/i);
  });

  it("returns err for empty input", () => {
    const result = decodeLicensePayload("");
    expect(result.ok).toBe(false);
  });
});

describe("license format — round-trip property tests", () => {
  // Random fuzz across realistic payloads — encode, decode, expect equality.
  // Catches off-by-one errors in field parsing or accidental coercion (e.g.
  // `parseInt` losing precision on large timestamps).
  const tiers = ["free", "personal", "pro"] as const;
  const FUZZ_ITERATIONS = 50;

  for (let i = 0; i < FUZZ_ITERATIONS; i++) {
    it(`round-trips a randomized payload (case ${i})`, () => {
      const payload: LicensePayload = {
        tier: tiers[Math.floor(Math.random() * tiers.length)],
        // Realistic Stripe customer IDs are short alphanumerics; constrain accordingly
        customerId: "cus_" + Math.random().toString(36).slice(2, 18),
        keyId: Array.from({ length: 32 }, () =>
          Math.floor(Math.random() * 16).toString(16),
        ).join(""),
        issuedAtSec: Math.floor(Math.random() * 2_000_000_000),
        expirySec: Math.floor(Math.random() * 2_000_000_000),
      };
      const encoded = encodeLicensePayload(payload);
      const decoded = decodeLicensePayload(encoded);
      expect(decoded.ok).toBe(true);
      if (decoded.ok) expect(decoded.value).toEqual(payload);
    });
  }
});
