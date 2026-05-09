import { describe, it, expect } from "vitest";
import { VercelKVLicenseStorage } from "../../../src/core/license/storage-vercel-kv";

/**
 * KV-backed adapter is intentionally a runtime stub until the KV provider
 * is selected (Vercel KV is deprecated; migrating to Upstash Redis or an
 * equivalent integration is tracked as a follow-up).
 *
 * The contract suite (`runStorageContractTests`) will be wired here once
 * a real client is in place. For now we assert the stub fails loudly on
 * use rather than silently no-op-ing — silent failure on a license store
 * is the worst possible mode.
 */
describe("VercelKVLicenseStorage (stub)", () => {
  it("throws on put until a KV client is wired", async () => {
    const storage = new VercelKVLicenseStorage();
    await expect(
      storage.put({
        keyId: "lic_x",
        customerId: "cus_x",
        tier: "personal",
        status: "active",
        issuedAtSec: 0,
        expirySec: 0,
        updatedAtSec: 0,
      }),
    ).rejects.toThrow(/KV client not yet wired/);
  });
});
