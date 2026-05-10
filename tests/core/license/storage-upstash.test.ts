import { describe, it, expect } from "vitest";
import { UpstashLicenseStorage } from "../../../src/core/license/storage-upstash";
import type { UpstashClient } from "../../../src/core/license/storage-upstash";
import { runStorageContractTests } from "./storage.test";

/**
 * In-memory fake of the {@link UpstashClient} subset the adapter calls.
 *
 * We don't use @upstash/redis in tests because (a) it requires a real HTTP
 * endpoint, and (b) the adapter's correctness is about how it composes Redis
 * primitives, not about Upstash's network reliability. Connectivity is
 * smoke-tested separately on first deploy.
 *
 * The fake's behavior matches the documented Upstash REST semantics:
 *  - GET returns the raw stored value or null for unknown keys
 *  - SET overwrites unconditionally
 *  - SADD / SMEMBERS / SISMEMBER follow standard Redis set semantics
 *  - EXISTS returns 0 or 1
 */
function createFakeUpstashClient(): UpstashClient & { _store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    _store: store,
    async get<T>(key: string): Promise<T | null> {
      return (store.get(key) as T | undefined) ?? null;
    },
    async set(key: string, value: unknown): Promise<"OK"> {
      store.set(key, value);
      return "OK";
    },
    async sadd(key: string, ...members: string[]): Promise<number> {
      const existing = (store.get(key) as Set<string> | undefined) ?? new Set();
      let added = 0;
      for (const m of members) {
        if (!existing.has(m)) {
          existing.add(m);
          added++;
        }
      }
      store.set(key, existing);
      return added;
    },
    async smembers(key: string): Promise<string[]> {
      const existing = store.get(key) as Set<string> | undefined;
      return existing ? Array.from(existing) : [];
    },
    async exists(key: string): Promise<number> {
      return store.has(key) ? 1 : 0;
    },
  };
}

runStorageContractTests(
  "UpstashLicenseStorage (with fake client)",
  () => new UpstashLicenseStorage(createFakeUpstashClient()),
);

describe("UpstashLicenseStorage — Redis key shape", () => {
  it("stores license records under license:record:<keyId>", async () => {
    const fake = createFakeUpstashClient();
    const storage = new UpstashLicenseStorage(fake);
    await storage.put({
      keyId: "lic_abc",
      customerId: "cus_xyz",
      tier: "personal",
      status: "active",
      issuedAtSec: 0,
      expirySec: 0,
      updatedAtSec: 0,
    });
    expect(fake._store.has("license:record:lic_abc")).toBe(true);
  });

  it("stores revocation under license:revoked:<keyId>", async () => {
    const fake = createFakeUpstashClient();
    const storage = new UpstashLicenseStorage(fake);
    await storage.revoke("lic_pwn", "leak");
    expect(fake._store.has("license:revoked:lic_pwn")).toBe(true);
  });

  it("maintains a customer→keyIds index under customer:<id>:keys", async () => {
    const fake = createFakeUpstashClient();
    const storage = new UpstashLicenseStorage(fake);
    await storage.put({
      keyId: "lic_a",
      customerId: "cus_index",
      tier: "personal",
      status: "active",
      issuedAtSec: 0,
      expirySec: 0,
      updatedAtSec: 0,
    });
    const set = fake._store.get("customer:cus_index:keys") as Set<string>;
    expect(set).toBeInstanceOf(Set);
    expect(set.has("lic_a")).toBe(true);
  });
});

describe("UpstashLicenseStorage — error surfacing", () => {
  it("returns ok(false) for never-revoked keyId (network OK, key absent)", async () => {
    const storage = new UpstashLicenseStorage(createFakeUpstashClient());
    const result = await storage.isRevoked("never-seen");
    expect(result.ok && result.value).toBe(false);
  });

  it("returns err on storage exception (e.g. Upstash unreachable)", async () => {
    const failingClient: UpstashClient = {
      get: async () => {
        throw new Error("ECONNREFUSED");
      },
      set: async () => "OK",
      sadd: async () => 0,
      smembers: async () => [],
      exists: async () => 0,
    };
    const storage = new UpstashLicenseStorage(failingClient);
    const result = await storage.get("lic_anything");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/ECONNREFUSED|upstash|storage/i);
  });
});
