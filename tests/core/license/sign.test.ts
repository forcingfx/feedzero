import { describe, it, expect } from "vitest";
import { signLicense, type SigningKey } from "@/core/license/sign";
import type { LicensePayload } from "@/core/license/format";

const SECRET = "this-is-a-test-signing-secret-32-bytes!";

const validPayload: LicensePayload = {
  tier: "pro",
  expirySec: 1_800_000_000,
  customerId: "cus_NQpJjB7ehjf2QH",
  keyId: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  issuedAtSec: 1_700_000_000,
};

const key: SigningKey = { secret: SECRET };

describe("license sign — signLicense", () => {
  it("returns a token in the form fz_<b64url>.<b64url>", async () => {
    const token = await signLicense(validPayload, key);
    expect(token).toMatch(/^fz_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it("is deterministic for the same payload + key", async () => {
    const a = await signLicense(validPayload, key);
    const b = await signLicense(validPayload, key);
    expect(a).toBe(b);
  });

  it("produces different tokens for different keys", async () => {
    const a = await signLicense(validPayload, key);
    const b = await signLicense(validPayload, { secret: "other-secret" });
    expect(a).not.toBe(b);
  });

  it("produces different tokens for different payloads", async () => {
    const a = await signLicense(validPayload, key);
    const b = await signLicense(
      { ...validPayload, tier: "personal" },
      key,
    );
    expect(a).not.toBe(b);
  });

  it("does not contain raw colons (payload is base64url-encoded)", async () => {
    const token = await signLicense(validPayload, key);
    // The encoded payload contains colons before encoding; after b64url
    // encoding, no colons should appear in the wire token.
    expect(token).not.toContain(":");
  });
});
