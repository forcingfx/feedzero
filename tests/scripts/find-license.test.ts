import { describe, it, expect } from "vitest";
import { MemoryLicenseStorage } from "@/core/license/storage.ts";
import type { LicenseRecord } from "@/core/license/storage.ts";
import { LicenseIssuerImpl } from "@/core/license/issuer.ts";
import { verifyLicense } from "@/core/license/verify.ts";
import {
  findLicenseByEmail,
  findLicenseByCustomer,
  reissueLicenseFor,
} from "@/core/license/admin-find-license.ts";

// PR K — Operator CLI library tests.
//
// The CLI is the operator's escape hatch when self-serve recovery fails.
// We test the LIBRARY-level functions (the testable surface), not the
// shell-level argument parsing or stdout printing. That keeps the tests
// fast and the script's I/O layer trivial.

const SIGNING_KEY = { secret: "test-signing-key-padding-padding-padding" };

function customerClient(impl: () => Promise<{ data: { id: string; email: string | null }[] }>) {
  return { list: impl };
}

function seedRecord(
  storage: MemoryLicenseStorage,
  overrides: Partial<LicenseRecord> = {},
): LicenseRecord {
  const record: LicenseRecord = {
    keyId: "lk_test_active",
    customerId: "cus_PqRsTuVwXyZ",
    subscriptionId: "sub_abc",
    tier: "personal",
    status: "active",
    issuedAtSec: 1_700_000_000,
    expirySec: 1_900_000_000,
    updatedAtSec: 1_700_000_000,
    ...overrides,
  };
  storage.put(record);
  return record;
}

describe("findLicenseByEmail", () => {
  it("returns Stripe customer + license records when the email matches", async () => {
    const storage = new MemoryLicenseStorage();
    seedRecord(storage);

    const result = await findLicenseByEmail({
      customers: customerClient(async () => ({
        data: [{ id: "cus_PqRsTuVwXyZ", email: "user@example.com" }],
      })),
      storage,
      email: "user@example.com",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.customer?.id).toBe("cus_PqRsTuVwXyZ");
    expect(result.value.records).toHaveLength(1);
    expect(result.value.records[0].keyId).toBe("lk_test_active");
  });

  it("returns customer: null and empty records when the email doesn't match Stripe", async () => {
    const storage = new MemoryLicenseStorage();
    const result = await findLicenseByEmail({
      customers: customerClient(async () => ({ data: [] })),
      storage,
      email: "ghost@example.com",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.customer).toBeNull();
    expect(result.value.records).toEqual([]);
  });

  it("returns records sorted newest-first by issuedAtSec", async () => {
    const storage = new MemoryLicenseStorage();
    seedRecord(storage, { keyId: "lk_older", issuedAtSec: 1_600_000_000 });
    seedRecord(storage, { keyId: "lk_newer", issuedAtSec: 1_800_000_000 });

    const result = await findLicenseByEmail({
      customers: customerClient(async () => ({
        data: [{ id: "cus_PqRsTuVwXyZ", email: "user@example.com" }],
      })),
      storage,
      email: "user@example.com",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.records.map((r) => r.keyId)).toEqual([
      "lk_newer",
      "lk_older",
    ]);
  });
});

describe("findLicenseByCustomer", () => {
  it("skips the Stripe customer lookup and goes straight to storage", async () => {
    const storage = new MemoryLicenseStorage();
    seedRecord(storage);

    let stripeCalled = false;
    const result = await findLicenseByCustomer({
      customers: customerClient(async () => {
        stripeCalled = true;
        return { data: [] };
      }),
      storage,
      customerId: "cus_PqRsTuVwXyZ",
    });

    expect(stripeCalled).toBe(false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.records).toHaveLength(1);
  });

  it("returns an empty record list when the customer has no licenses", async () => {
    const storage = new MemoryLicenseStorage();
    const result = await findLicenseByCustomer({
      customers: customerClient(async () => ({ data: [] })),
      storage,
      customerId: "cus_no_records",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.records).toEqual([]);
  });
});

describe("reissueLicenseFor", () => {
  it("mints a fresh token verifiable against the signing key", async () => {
    const storage = new MemoryLicenseStorage();
    const seeded = seedRecord(storage);
    const issuer = new LicenseIssuerImpl({
      signingKey: SIGNING_KEY,
      storage,
      nowSec: () => 1_800_000_000,
    });

    const result = await reissueLicenseFor({
      issuer,
      storage,
      customerId: seeded.customerId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The reissued token must verify against the signing key. This is the
    // load-bearing assertion: a CLI that prints a token the verifier
    // rejects is worse than no CLI at all.
    const verified = await verifyLicense(result.value.token, SIGNING_KEY, {
      nowSec: 1_800_000_001,
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.value.customerId).toBe(seeded.customerId);
    expect(verified.value.tier).toBe("personal");
  });

  it("writes a new LicenseRecord without revoking the existing active record", async () => {
    // The operator-issued token is auditable alongside the original — we
    // don't blast the existing record. If the operator wanted revocation,
    // they'd use a separate path (out of scope for this CLI).
    const storage = new MemoryLicenseStorage();
    const original = seedRecord(storage);
    const issuer = new LicenseIssuerImpl({
      signingKey: SIGNING_KEY,
      storage,
      nowSec: () => 1_800_000_000,
    });

    await reissueLicenseFor({
      issuer,
      storage,
      customerId: original.customerId,
    });

    const after = await storage.listByCustomer(original.customerId);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.length).toBe(2);
    const stillActive = after.value.find((r) => r.keyId === original.keyId);
    expect(stillActive?.status).toBe("active");
  });

  it("infers tier from the most recent active record", async () => {
    const storage = new MemoryLicenseStorage();
    // Older record was personal, but it's been revoked. Most recent
    // active is pro — the reissued token should be at pro tier.
    seedRecord(storage, {
      keyId: "lk_old_personal",
      tier: "personal",
      status: "revoked",
      issuedAtSec: 1_600_000_000,
    });
    seedRecord(storage, {
      keyId: "lk_new_pro",
      tier: "pro",
      status: "active",
      issuedAtSec: 1_800_000_000,
    });

    const issuer = new LicenseIssuerImpl({
      signingKey: SIGNING_KEY,
      storage,
      nowSec: () => 1_810_000_000,
    });

    const result = await reissueLicenseFor({
      issuer,
      storage,
      customerId: "cus_PqRsTuVwXyZ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const verified = await verifyLicense(result.value.token, SIGNING_KEY, {
      nowSec: 1_810_000_001,
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.value.tier).toBe("pro");
  });

  it("errs when the customer has no records to infer a tier from", async () => {
    // We deliberately refuse to invent a tier — if there's no precedent,
    // the operator must investigate manually (Stripe sub state, support
    // ticket context) rather than have the CLI silently default to free
    // or personal.
    const storage = new MemoryLicenseStorage();
    const issuer = new LicenseIssuerImpl({
      signingKey: SIGNING_KEY,
      storage,
      nowSec: () => 1_800_000_000,
    });

    const result = await reissueLicenseFor({
      issuer,
      storage,
      customerId: "cus_no_history",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/no.*records|no.*history|tier/i);
  });
});
