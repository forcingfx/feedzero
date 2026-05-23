import { describe, it, expect } from "vitest";
import {
  MemoryLicenseStorage,
  type LicenseRecord,
  type LicenseStorage,
} from "../../../src/core/license/storage";
import { isOk } from "@feedzero/core/utils/result";

/**
 * Build a sample LicenseRecord for tests. Defaults are intentionally boring
 * so each test can override only the field it cares about.
 */
function makeRecord(overrides: Partial<LicenseRecord> = {}): LicenseRecord {
  const now = 1_700_000_000;
  return {
    keyId: "lic_test_001",
    customerId: "cus_test_001",
    tier: "personal",
    status: "active",
    issuedAtSec: now,
    expirySec: now + 60 * 60 * 24 * 365,
    updatedAtSec: now,
    ...overrides,
  };
}

/**
 * Shared contract suite. Re-used for any LicenseStorage implementation —
 * runs against MemoryLicenseStorage today, will run against
 * VercelKVLicenseStorage once KV credentials are wired in CI.
 */
export function runStorageContractTests(
  name: string,
  makeStorage: () => LicenseStorage,
): void {
  describe(name, () => {
    it("put then get returns the same record", async () => {
      const storage = makeStorage();
      const record = makeRecord();

      await storage.put(record);
      const result = await storage.get(record.keyId);

      expect(isOk(result) && result.value).toEqual(record);
    });

    it("get for unknown keyId returns ok(null), not an error", async () => {
      const storage = makeStorage();

      const result = await storage.get("lic_does_not_exist");

      expect(isOk(result) && result.value).toBeNull();
    });

    it("revoke is idempotent and isRevoked stays true", async () => {
      const storage = makeStorage();
      const keyId = "lic_revoke_twice";

      await storage.revoke(keyId, "leak");
      const second = await storage.revoke(keyId, "leak again");
      const revoked = await storage.isRevoked(keyId);

      expect(isOk(second) && isOk(revoked) && revoked.value).toBe(true);
    });

    it("isRevoked returns false for never-revoked keyIds", async () => {
      const storage = makeStorage();

      const result = await storage.isRevoked("lic_never_seen");

      expect(isOk(result) && result.value).toBe(false);
    });

    it("revoke does not delete the underlying record", async () => {
      const storage = makeStorage();
      const record = makeRecord({ keyId: "lic_audit_trail" });
      await storage.put(record);

      await storage.revoke(record.keyId, "audit-trail-test");
      const fetched = await storage.get(record.keyId);

      expect(isOk(fetched) && fetched.value).toEqual(record);
    });

    it("put does not clear the deny-list for a previously revoked keyId", async () => {
      const storage = makeStorage();
      const record = makeRecord({ keyId: "lic_one_way_revoke" });
      await storage.revoke(record.keyId, "leak");

      await storage.put(record);
      const revoked = await storage.isRevoked(record.keyId);

      expect(isOk(revoked) && revoked.value).toBe(true);
    });

    it("listByCustomer returns every record issued for that customer", async () => {
      const storage = makeStorage();
      await storage.put(
        makeRecord({ keyId: "lic_list_a", customerId: "cus_list" }),
      );
      await storage.put(
        makeRecord({ keyId: "lic_list_b", customerId: "cus_list" }),
      );
      await storage.put(
        makeRecord({ keyId: "lic_list_c", customerId: "cus_other" }),
      );

      const result = await storage.listByCustomer("cus_list");

      expect(isOk(result) && result.value.map((r) => r.keyId).sort()).toEqual([
        "lic_list_a",
        "lic_list_b",
      ]);
    });

    it("listByCustomer returns ok([]) for an unknown customer", async () => {
      const storage = makeStorage();

      const result = await storage.listByCustomer("cus_never_seen");

      expect(isOk(result) && result.value).toEqual([]);
    });

    it("revokeAllForCustomer revokes every record for that customer", async () => {
      const storage = makeStorage();
      await storage.put(
        makeRecord({ keyId: "lic_revall_a", customerId: "cus_revall" }),
      );
      await storage.put(
        makeRecord({ keyId: "lic_revall_b", customerId: "cus_revall" }),
      );
      await storage.put(
        makeRecord({ keyId: "lic_revall_c", customerId: "cus_other" }),
      );

      await storage.revokeAllForCustomer("cus_revall", "subscription_deleted");

      const aRevoked = await storage.isRevoked("lic_revall_a");
      const bRevoked = await storage.isRevoked("lic_revall_b");
      const cRevoked = await storage.isRevoked("lic_revall_c");
      expect(
        isOk(aRevoked) &&
          aRevoked.value &&
          isOk(bRevoked) &&
          bRevoked.value &&
          isOk(cRevoked) &&
          !cRevoked.value,
      ).toBe(true);
    });
  });
}

runStorageContractTests(
  "MemoryLicenseStorage",
  () => new MemoryLicenseStorage(),
);
