import { describe, it, expect } from "vitest";
import { LicenseIssuerImpl } from "@/core/license/issuer";
import { MemoryLicenseStorage } from "@/core/license/storage";
import { verifyLicense } from "@/core/license/verify";
import type { SigningKey } from "@/core/license/sign";
import { isOk } from "@/utils/result";

const SECRET = "this-is-a-test-signing-secret-32-bytes!";
const KEY: SigningKey = { secret: SECRET };
const NOW = 1_750_000_000;

/**
 * Build an issuer wired with deterministic time + keyId generation so each
 * test asserts on a known shape rather than chasing random output.
 */
function makeIssuer(
  overrides: {
    nowSec?: () => number;
    generateKeyId?: () => string;
    defaultExpirySec?: number;
  } = {},
): { issuer: LicenseIssuerImpl; storage: MemoryLicenseStorage } {
  const storage = new MemoryLicenseStorage();
  const issuer = new LicenseIssuerImpl({
    signingKey: KEY,
    storage,
    nowSec: overrides.nowSec ?? (() => NOW),
    generateKeyId:
      overrides.generateKeyId ?? (() => "deterministic_key_id_0001"),
    defaultExpirySec: overrides.defaultExpirySec,
  });
  return { issuer, storage };
}

describe("LicenseIssuerImpl — issueWithToken", () => {
  it("returns a token that verifyLicense decodes successfully", async () => {
    const { issuer } = makeIssuer();

    const result = await issuer.issueWithToken({
      customerId: "cus_001",
      tier: "personal",
      subscriptionId: "sub_001",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const verified = await verifyLicense(result.value.token, KEY, {
      nowSec: NOW,
    });
    expect(verified.ok).toBe(true);
  });

  it("persists the issued record with status=active", async () => {
    const { issuer, storage } = makeIssuer();

    const issued = await issuer.issueWithToken({
      customerId: "cus_002",
      tier: "pro",
      subscriptionId: "sub_002",
    });
    expect(isOk(issued)).toBe(true);
    if (!isOk(issued)) return;

    const fetched = await storage.get(issued.value.record.keyId);
    expect(isOk(fetched) && fetched.value?.status).toBe("active");
  });

  it("returns a token whose payload echoes the input args", async () => {
    const { issuer } = makeIssuer();

    const issued = await issuer.issueWithToken({
      customerId: "cus_003",
      tier: "pro",
      subscriptionId: "sub_003",
    });
    expect(isOk(issued)).toBe(true);
    if (!isOk(issued)) return;

    const verified = await verifyLicense(issued.value.token, KEY, {
      nowSec: NOW,
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect({
      tier: verified.value.tier,
      customerId: verified.value.customerId,
    }).toEqual({ tier: "pro", customerId: "cus_003" });
  });

  it("generates a fresh keyId per call", async () => {
    const ids = [
      "kid_a_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "kid_b_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ];
    let i = 0;
    const { issuer } = makeIssuer({ generateKeyId: () => ids[i++] });

    const a = await issuer.issueWithToken({
      customerId: "cus_004",
      tier: "personal",
      subscriptionId: "sub_004a",
    });
    const b = await issuer.issueWithToken({
      customerId: "cus_004",
      tier: "personal",
      subscriptionId: "sub_004b",
    });

    expect(
      isOk(a) && isOk(b) && a.value.record.keyId !== b.value.record.keyId,
    ).toBe(true);
  });

  it("defaults expirySec to nowSec + 31 days when not provided", async () => {
    const { issuer } = makeIssuer();
    const expected = NOW + 31 * 24 * 3600;

    const issued = await issuer.issueWithToken({
      customerId: "cus_005",
      tier: "personal",
      subscriptionId: "sub_005",
    });

    expect(isOk(issued) && issued.value.record.expirySec).toBe(expected);
  });
});

describe("LicenseIssuerImpl — issue (interface method)", () => {
  it("succeeds and the resulting record is recoverable from storage", async () => {
    const { issuer, storage } = makeIssuer({
      generateKeyId: () => "interface_method_key_id_xxxxxxxx",
    });

    const result = await issuer.issue({
      customerId: "cus_006",
      tier: "personal",
      subscriptionId: "sub_006",
    });
    expect(isOk(result)).toBe(true);

    const fetched = await storage.get("interface_method_key_id_xxxxxxxx");
    expect(isOk(fetched) && fetched.value?.customerId).toBe("cus_006");
  });
});

describe("LicenseIssuerImpl — revoke", () => {
  it("marks ALL records for a customer as revoked", async () => {
    const ids = [
      "kid_revoke_a_aaaaaaaaaaaaaaaaaaaaa",
      "kid_revoke_b_bbbbbbbbbbbbbbbbbbbbb",
    ];
    let i = 0;
    const { issuer, storage } = makeIssuer({ generateKeyId: () => ids[i++] });

    await issuer.issue({
      customerId: "cus_revoke",
      tier: "personal",
      subscriptionId: "sub_revoke_a",
    });
    await issuer.issue({
      customerId: "cus_revoke",
      tier: "personal",
      subscriptionId: "sub_revoke_b",
    });

    const revoked = await issuer.revoke({
      customerId: "cus_revoke",
      subscriptionId: "sub_revoke_a",
      reason: "subscription_deleted",
    });
    expect(isOk(revoked)).toBe(true);

    const aRevoked = await storage.isRevoked(ids[0]);
    const bRevoked = await storage.isRevoked(ids[1]);
    expect(
      isOk(aRevoked) && aRevoked.value && isOk(bRevoked) && bRevoked.value,
    ).toBe(true);
  });
});

describe("LicenseIssuerImpl — recordRenewal", () => {
  it("updates expirySec on a matching record", async () => {
    const keyId = "kid_renewal_match_xxxxxxxxxxxxxxx";
    const { issuer, storage } = makeIssuer({ generateKeyId: () => keyId });

    await issuer.issue({
      customerId: "cus_renew",
      tier: "personal",
      subscriptionId: "sub_renew",
    });

    const newExpiry = NOW + 90 * 24 * 3600;
    await issuer.recordRenewal({
      customerId: "cus_renew",
      subscriptionId: "sub_renew",
      expirySec: newExpiry,
    });

    const fetched = await storage.get(keyId);
    expect(isOk(fetched) && fetched.value?.expirySec).toBe(newExpiry);
  });

  it("falls back to issue when no matching record exists", async () => {
    const fallbackKeyId = "kid_renewal_fallback_xxxxxxxxxxxx";
    const { issuer, storage } = makeIssuer({
      generateKeyId: () => fallbackKeyId,
    });

    const newExpiry = NOW + 90 * 24 * 3600;
    const result = await issuer.recordRenewal({
      customerId: "cus_no_record",
      subscriptionId: "sub_no_record",
      expirySec: newExpiry,
    });
    expect(isOk(result)).toBe(true);

    const fetched = await storage.get(fallbackKeyId);
    expect(isOk(fetched) && fetched.value?.expirySec).toBe(newExpiry);
  });
});
