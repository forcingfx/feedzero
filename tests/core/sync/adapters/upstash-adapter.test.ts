/**
 * Upstash-backed sync adapter (PR #45 — consolidates vault storage onto the
 * Upstash KV that already serves license storage + Stripe event-id dedup).
 *
 * Why this adapter exists: yesterday's 2026-05-12 production sync regression
 * (kenkiller's Reddit report) was rooted in operator state on the Vercel Blob
 * integration. Consolidating to one storage backend (Upstash) removes the
 * "two integrations to keep healthy" failure mode entirely. The license
 * adapter migration (PR U) is the template; this mirrors its shape.
 *
 * The adapter accepts an injected `UpstashSyncClient` so tests can pass a
 * fake (no SDK, no network). The production wrapper constructs a real
 * `@upstash/redis` Redis client and passes it in.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  UpstashSyncAdapter,
  type UpstashSyncClient,
  hasUpstashSyncCredentials,
} from "@/core/sync/adapters/upstash-adapter";
import type { SyncStorageAdapter } from "@/core/sync/types";

function fakeClient(): UpstashSyncClient & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    store,
    async get<T = string>(key: string): Promise<T | null> {
      // The fake only stores strings (that's all the sync adapter ever
      // writes), but the interface's `<T>` generic requires us to widen
      // the return type at the boundary so callers can request a narrower T.
      return store.has(key) ? (store.get(key) as T) : null;
    },
    async set(key, value) {
      store.set(key, String(value));
      return "OK";
    },
    async del(key) {
      const had = store.has(key);
      store.delete(key);
      return had ? 1 : 0;
    },
    async scan(cursor, opts) {
      // Single-shot scan implementation — returns every matching key on the
      // first call, then cursor=0 (idiomatic completion signal). Production
      // Upstash paginates real responses; the adapter must handle the
      // paginated case, which is why the contract uses (cursor, match).
      const match = opts?.match ?? "*";
      const prefix = match.replace(/\*$/, "");
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix));
      // The Upstash SDK returns [nextCursor, keys]. We return 0 on the first
      // call to signal "complete". Tests that exercise pagination override
      // this via vi.fn.
      const nextCursor = cursor === 0 ? 0 : 0;
      return [nextCursor, keys];
    },
  };
}

const VAULT_ID = "a".repeat(64);
const SAMPLE_VAULT_JSON = JSON.stringify({
  ok: true,
  vault: { version: 1, iv: [1, 2, 3], ciphertext: "encrypted-blob" },
});

describe("UpstashSyncAdapter", () => {
  let client: ReturnType<typeof fakeClient>;
  let adapter: SyncStorageAdapter;

  beforeEach(() => {
    client = fakeClient();
    adapter = new UpstashSyncAdapter(client);
  });

  describe("get", () => {
    it("returns ok(null) when vault key is absent", async () => {
      const result = await adapter.get(VAULT_ID);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });

    it("returns the stored vault payload string under the namespaced key", async () => {
      client.store.set(`vault:${VAULT_ID}`, SAMPLE_VAULT_JSON);
      const result = await adapter.get(VAULT_ID);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(SAMPLE_VAULT_JSON);
    });

    it("returns Result.err when the Upstash client throws", async () => {
      const broken: UpstashSyncClient = {
        async get() {
          throw new Error("network down");
        },
        async set() {
          return "OK";
        },
        async del() {
          return 0;
        },
        async scan() {
          return [0, []];
        },
      };
      const result = await new UpstashSyncAdapter(broken).get(VAULT_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/network down/);
    });
  });

  describe("put", () => {
    it("writes the payload string under vault:<id>", async () => {
      const result = await adapter.put(VAULT_ID, SAMPLE_VAULT_JSON);
      expect(result.ok).toBe(true);
      expect(client.store.get(`vault:${VAULT_ID}`)).toBe(SAMPLE_VAULT_JSON);
    });

    it("overwrites an existing value (last-write-wins, idempotent re-push)", async () => {
      await adapter.put(VAULT_ID, "first");
      await adapter.put(VAULT_ID, "second");
      expect(client.store.get(`vault:${VAULT_ID}`)).toBe("second");
    });

    it("returns Result.err when the Upstash client throws", async () => {
      const broken: UpstashSyncClient = {
        async get() {
          return null;
        },
        async set() {
          throw new Error("redis error");
        },
        async del() {
          return 0;
        },
        async scan() {
          return [0, []];
        },
      };
      const result = await new UpstashSyncAdapter(broken).put(
        VAULT_ID,
        SAMPLE_VAULT_JSON,
      );
      expect(result.ok).toBe(false);
    });
  });

  describe("delete", () => {
    it("removes the key and returns ok(true)", async () => {
      client.store.set(`vault:${VAULT_ID}`, SAMPLE_VAULT_JSON);
      const result = await adapter.delete(VAULT_ID);
      expect(result.ok).toBe(true);
      expect(client.store.has(`vault:${VAULT_ID}`)).toBe(false);
    });

    it("is idempotent — deleting a missing key still returns ok", async () => {
      const result = await adapter.delete(VAULT_ID);
      expect(result.ok).toBe(true);
    });

    it("returns Result.err when the Upstash client throws", async () => {
      const broken: UpstashSyncClient = {
        async get() {
          return null;
        },
        async set() {
          return "OK";
        },
        async del() {
          throw new Error("redis down");
        },
        async scan() {
          return [0, []];
        },
      };
      const result = await new UpstashSyncAdapter(broken).delete(VAULT_ID);
      expect(result.ok).toBe(false);
    });
  });

  describe("count", () => {
    it("returns 0 when no vaults are stored", async () => {
      const result = await adapter.count();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(0);
    });

    it("counts only keys matching the vault: prefix (ignores license:* etc.)", async () => {
      client.store.set(`vault:${"a".repeat(64)}`, "v1");
      client.store.set(`vault:${"b".repeat(64)}`, "v2");
      client.store.set("license:record:abc", "should-not-count");
      client.store.set("customer:xyz:keys", "should-not-count");

      const result = await adapter.count();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(2);
    });

    it("paginates via SCAN cursor (never uses KEYS, which would block Redis)", async () => {
      // Production Upstash returns paginated SCAN results. The adapter must
      // iterate until cursor === 0, accumulating keys across pages. Without
      // this, a deployment with >100 vaults would silently undercount.
      const scanCalls: Array<[number | string, { match?: string }]> = [];
      const pages: Array<[number | string, string[]]> = [
        [42, ["vault:aaa", "vault:bbb"]],
        [73, ["vault:ccc"]],
        [0, ["vault:ddd", "vault:eee"]],
      ];
      let callIdx = 0;
      const paginatingClient: UpstashSyncClient = {
        async get() {
          return null;
        },
        async set() {
          return "OK";
        },
        async del() {
          return 0;
        },
        async scan(cursor, opts) {
          scanCalls.push([cursor, opts ?? {}]);
          return pages[callIdx++] as [number | string, string[]];
        },
      };

      const result = await new UpstashSyncAdapter(paginatingClient).count();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(5);
      expect(scanCalls.length).toBe(3);
      // Every call uses the vault:* match pattern.
      for (const [, opts] of scanCalls) {
        expect(opts.match).toBe("vault:*");
      }
    });

    it("returns Result.err when SCAN throws on any page", async () => {
      const broken: UpstashSyncClient = {
        async get() {
          return null;
        },
        async set() {
          return "OK";
        },
        async del() {
          return 0;
        },
        async scan() {
          throw new Error("scan failed");
        },
      };
      const result = await new UpstashSyncAdapter(broken).count();
      expect(result.ok).toBe(false);
    });
  });

  describe("isolation from license storage (same Redis, different keyspace)", () => {
    // Defensive: sync vault keys must never collide with license storage
    // keys. The license adapter uses `license:record:*`, `license:revoked:*`,
    // `customer:*:keys`. The sync adapter uses `vault:*`. As long as no
    // vaultId starts with "license:" or contains ":" we're safe — vaultIds
    // are 64-hex-char strings (enforced by VAULT_ID_PATTERN in sync-handler),
    // so this is structurally impossible. This test pins that invariant.

    it("uses 'vault:' prefix for all keys — no collision with license: namespace", async () => {
      await adapter.put(VAULT_ID, SAMPLE_VAULT_JSON);
      const keys = [...client.store.keys()];
      expect(keys.every((k) => k.startsWith("vault:"))).toBe(true);
      expect(keys.some((k) => k.startsWith("license:"))).toBe(false);
      expect(keys.some((k) => k.startsWith("customer:"))).toBe(false);
    });
  });
});

describe("hasUpstashSyncCredentials", () => {
  // Mirrors `hasUpstashCredentials` from the license module. Defined as a
  // separate export so the sync resolver doesn't have to reach into the
  // license module's internals for a predicate it uses.

  it("returns false when neither UPSTASH_* nor KV_REST_API_* are set", () => {
    expect(hasUpstashSyncCredentials({})).toBe(false);
  });

  it("returns true for canonical UPSTASH_REDIS_REST_* names", () => {
    expect(
      hasUpstashSyncCredentials({
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "tok",
      }),
    ).toBe(true);
  });

  it("returns true for Vercel-Marketplace KV_REST_API_* names", () => {
    expect(
      hasUpstashSyncCredentials({
        KV_REST_API_URL: "https://example.upstash.io",
        KV_REST_API_TOKEN: "tok",
      }),
    ).toBe(true);
  });

  it("returns false when only one half of a credential pair is set", () => {
    expect(
      hasUpstashSyncCredentials({ UPSTASH_REDIS_REST_URL: "https://x" }),
    ).toBe(false);
    expect(
      hasUpstashSyncCredentials({ KV_REST_API_TOKEN: "tok" }),
    ).toBe(false);
  });
});
