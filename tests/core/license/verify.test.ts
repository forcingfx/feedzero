import { describe, it, expect } from "vitest";
import { signLicense, type SigningKey } from "@/core/license/sign";
import { verifyLicense } from "@/core/license/verify";
import type { LicensePayload } from "@/core/license/format";

const SECRET = "this-is-a-test-signing-secret-32-bytes!";
const key: SigningKey = { secret: SECRET };
const NOW = 1_750_000_000; // mid-2025-ish, between issuedAt and expiry below

const validPayload: LicensePayload = {
  tier: "pro",
  expirySec: 1_800_000_000,
  customerId: "cus_NQpJjB7ehjf2QH",
  keyId: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  issuedAtSec: 1_700_000_000,
};

describe("license verify — verifyLicense", () => {
  it("returns ok with the original payload for a valid token", async () => {
    const token = await signLicense(validPayload, key);
    const result = await verifyLicense(token, key, { nowSec: NOW });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(validPayload);
  });

  it("returns err for an empty token", async () => {
    const result = await verifyLicense("", key, { nowSec: NOW });
    expect(result.ok).toBe(false);
  });

  it("returns err for a token without the fz_ prefix", async () => {
    const result = await verifyLicense("notatoken.atall", key, { nowSec: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/format|prefix/i);
  });

  it("returns err for a token with the wrong number of parts", async () => {
    const result = await verifyLicense("fz_abc", key, { nowSec: NOW });
    expect(result.ok).toBe(false);
  });

  it("returns err when the signature doesn't match the payload (tampered payload)", async () => {
    const goodToken = await signLicense(validPayload, key);
    const [head, sig] = goodToken.split(".");
    // Tamper: append a character to the encoded payload, keep original sig.
    const tampered = `${head}X.${sig}`;
    const result = await verifyLicense(tampered, key, { nowSec: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/signature/i);
  });

  it("returns err when the signature was made with a different key", async () => {
    const tokenWithOtherKey = await signLicense(validPayload, {
      secret: "different-secret-entirely",
    });
    const result = await verifyLicense(tokenWithOtherKey, key, { nowSec: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/signature/i);
  });

  it("returns err when the token is expired", async () => {
    const expiredPayload: LicensePayload = {
      ...validPayload,
      expirySec: NOW - 1,
    };
    const token = await signLicense(expiredPayload, key);
    const result = await verifyLicense(token, key, { nowSec: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/expired/i);
  });

  it("accepts a token that expires exactly at nowSec (boundary inclusive)", async () => {
    const boundaryPayload: LicensePayload = {
      ...validPayload,
      expirySec: NOW,
    };
    const token = await signLicense(boundaryPayload, key);
    const result = await verifyLicense(token, key, { nowSec: NOW });
    expect(result.ok).toBe(true);
  });

  it("returns err when issuedAtSec is in the future (clock skew protection)", async () => {
    const futurePayload: LicensePayload = {
      ...validPayload,
      issuedAtSec: NOW + 60 * 60, // 1 hour in the future
    };
    const token = await signLicense(futurePayload, key);
    const result = await verifyLicense(token, key, { nowSec: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/issued|future/i);
  });

  it("verification uses constant-time comparison (does not short-circuit on first byte mismatch)", async () => {
    // Property test — many bad signatures, all should err uniformly. This
    // doesn't *prove* constant-time behavior, but it does prove we don't
    // accidentally accept any of the easy variants (off-by-one, prefix match,
    // length mismatch).
    const goodToken = await signLicense(validPayload, key);
    const [head, sig] = goodToken.split(".");
    const variants = [
      `${head}.${sig.slice(0, -1)}A`,                  // last char swapped
      `${head}.A${sig.slice(1)}`,                      // first char swapped
      `${head}.${sig.slice(0, sig.length / 2)}`,       // truncated to half
      `${head}.${sig}${sig}`,                          // doubled
      `${head}.`,                                      // empty sig
    ];
    for (const v of variants) {
      const result = await verifyLicense(v, key, { nowSec: NOW });
      expect(result.ok, `should reject: ${v}`).toBe(false);
    }
  });
});
