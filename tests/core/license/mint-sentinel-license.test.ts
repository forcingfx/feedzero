import { describe, it, expect } from "vitest";
import {
  buildSentinelLicensePayload,
  mintSentinelLicense,
  parseMintTestLicenseArgs,
  TEST_LICENSE_SENTINEL,
  DEFAULT_TEST_LICENSE_DAYS,
} from "@/core/license/mint-sentinel-license";
import { verifyLicense } from "@/core/license/verify";
import { normalizeTier } from "@/core/features/tier-matrix";

// Library surface for `scripts/mint-test-license.ts` (operator mints a
// Supporter token to test gated features such as Signal) and
// `scripts/mint-smoke-license.ts` (CI's SMOKE_LICENSE_TOKEN). Both are
// shells over these functions, mirroring the find-license.ts /
// admin-find-license.ts split, so the testable surface lives here.

const KEY = { secret: "test-signing-key-padding-padding-padding" };
const NOW_SEC = 1_800_000_000;
const DAY_SEC = 24 * 3600;

describe("buildSentinelLicensePayload", () => {
  it("mints a personal (Supporter) license for the sentinel customer", () => {
    const result = buildSentinelLicensePayload({
      sentinel: TEST_LICENSE_SENTINEL,
      tier: "personal",
      ttlSec: 30 * DAY_SEC,
      nowSec: NOW_SEC,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tier).toBe("personal");
    expect(normalizeTier(result.value.tier)).toBe("personal");
    expect(result.value.customerId).toBe("test-license");
    expect(result.value.issuedAtSec).toBe(NOW_SEC);
    expect(result.value.expirySec).toBe(NOW_SEC + 30 * DAY_SEC);
    expect(result.value.keyId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("appends a label so several test tokens stay distinguishable", () => {
    const result = buildSentinelLicensePayload({
      sentinel: TEST_LICENSE_SENTINEL,
      label: "signal-qa",
      tier: "personal",
      ttlSec: DAY_SEC,
      nowSec: NOW_SEC,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.customerId).toBe("test-license-signal-qa");
  });

  it("rejects a label that would corrupt the colon-joined wire format", () => {
    const result = buildSentinelLicensePayload({
      sentinel: TEST_LICENSE_SENTINEL,
      label: "a:b",
      tier: "personal",
      ttlSec: DAY_SEC,
      nowSec: NOW_SEC,
    });

    expect(result.ok).toBe(false);
  });

  it("rejects a label that could pass for a real Stripe customer", () => {
    // The sentinel exists so a test token is grep-able and never matches a
    // `cus_*` id. A label that smuggles one in defeats that.
    const result = buildSentinelLicensePayload({
      sentinel: TEST_LICENSE_SENTINEL,
      label: "cus_PqRsTuVwXyZ",
      tier: "personal",
      ttlSec: DAY_SEC,
      nowSec: NOW_SEC,
    });

    expect(result.ok).toBe(false);
  });

  it("rejects a non-positive ttl", () => {
    const result = buildSentinelLicensePayload({
      sentinel: TEST_LICENSE_SENTINEL,
      tier: "personal",
      ttlSec: 0,
      nowSec: NOW_SEC,
    });

    expect(result.ok).toBe(false);
  });
});

describe("mintSentinelLicense", () => {
  it("returns a token the verifier accepts under the same key", async () => {
    const minted = await mintSentinelLicense(
      {
        sentinel: TEST_LICENSE_SENTINEL,
        tier: "personal",
        ttlSec: 30 * DAY_SEC,
        nowSec: NOW_SEC,
      },
      KEY,
    );

    expect(minted.ok).toBe(true);
    if (!minted.ok) return;
    expect(minted.value.token).toMatch(/^fz_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    const verified = await verifyLicense(minted.value.token, KEY, {
      nowSec: NOW_SEC + 29 * DAY_SEC,
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.value).toEqual(minted.value.payload);
  });

  it("returns a token the verifier rejects under a different key", async () => {
    const minted = await mintSentinelLicense(
      {
        sentinel: TEST_LICENSE_SENTINEL,
        tier: "personal",
        ttlSec: DAY_SEC,
        nowSec: NOW_SEC,
      },
      KEY,
    );
    expect(minted.ok).toBe(true);
    if (!minted.ok) return;

    const verified = await verifyLicense(
      minted.value.token,
      { secret: "some-other-signing-key-padding-padding" },
      { nowSec: NOW_SEC },
    );
    expect(verified.ok).toBe(false);
  });

  it("reports the expiry as an ISO date for the operator", async () => {
    const minted = await mintSentinelLicense(
      {
        sentinel: TEST_LICENSE_SENTINEL,
        tier: "personal",
        ttlSec: 30 * DAY_SEC,
        nowSec: NOW_SEC,
      },
      KEY,
    );
    expect(minted.ok).toBe(true);
    if (!minted.ok) return;
    expect(minted.value.expiresOn).toBe(
      new Date((NOW_SEC + 30 * DAY_SEC) * 1000).toISOString().slice(0, 10),
    );
  });

  it("propagates a payload error instead of signing garbage", async () => {
    const minted = await mintSentinelLicense(
      {
        sentinel: TEST_LICENSE_SENTINEL,
        label: "bad:label",
        tier: "personal",
        ttlSec: DAY_SEC,
        nowSec: NOW_SEC,
      },
      KEY,
    );
    expect(minted.ok).toBe(false);
  });
});

describe("parseMintTestLicenseArgs", () => {
  it("defaults to a short-lived token with no label", () => {
    const parsed = parseMintTestLicenseArgs([]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual({
      days: DEFAULT_TEST_LICENSE_DAYS,
      label: undefined,
    });
  });

  it("reads --days and --label", () => {
    const parsed = parseMintTestLicenseArgs([
      "--days",
      "90",
      "--label",
      "signal-qa",
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual({ days: 90, label: "signal-qa" });
  });

  it("rejects a --days value that is not a positive integer", () => {
    expect(parseMintTestLicenseArgs(["--days", "0"]).ok).toBe(false);
    expect(parseMintTestLicenseArgs(["--days", "1.5"]).ok).toBe(false);
    expect(parseMintTestLicenseArgs(["--days", "soon"]).ok).toBe(false);
  });

  it("rejects an unknown flag so a typo cannot silently mint defaults", () => {
    expect(parseMintTestLicenseArgs(["--day", "30"]).ok).toBe(false);
  });

  it("rejects a flag with no value", () => {
    expect(parseMintTestLicenseArgs(["--label"]).ok).toBe(false);
  });
});
