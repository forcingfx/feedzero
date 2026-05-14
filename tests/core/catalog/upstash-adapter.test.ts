/**
 * Upstash-backed catalog storage adapter (PR following #45 — eliminates the
 * "stats always show zero" bug rooted in the memory-only catalog adapter
 * being reset on every Vercel Lambda cold start).
 *
 * Key layout:
 *   catalog:feed:<url>   — JSON CatalogFeed (one per known feed URL)
 *   catalog:ranking      — Redis sorted set keyed on requestCount, members
 *                          are feed URLs. Enables O(log N) inserts and
 *                          O(top-K) reads for popular().
 *
 * The adapter accepts an injected `UpstashCatalogClient` so tests stay
 * trivially mockable. Production wrapper constructs a real `@upstash/redis`
 * Redis client and passes it in. Mirrors `storage-upstash.ts` exactly.
 */

import { describe, it, expect } from "vitest";
import {
  UpstashCatalogAdapter,
  type UpstashCatalogClient,
} from "@/core/catalog/adapters/upstash-adapter";

/** In-memory fake of the small Upstash subset the adapter needs. */
function fakeClient(): UpstashCatalogClient & {
  store: Map<string, unknown>;
  zset: Map<string, number>;
} {
  const store = new Map<string, unknown>();
  const zset = new Map<string, number>(); // member -> score
  return {
    store,
    zset,
    async get<T = unknown>(key: string): Promise<T | null> {
      return store.has(key) ? (store.get(key) as T) : null;
    },
    async set(key, value) {
      store.set(key, value);
      return "OK";
    },
    async zadd(_key, scoreMember) {
      // Upstash zadd accepts { score, member }. Our fake supports only the
      // single-pair variant the adapter uses.
      zset.set(scoreMember.member, scoreMember.score);
      return 1;
    },
    async zcard(_key) {
      return zset.size;
    },
    async zrange(_key, start, stop, opts) {
      // Sorted desc when opts.rev = true; the adapter always passes rev: true
      // for popular(). Return member URLs in score order.
      const entries = [...zset.entries()].sort((a, b) =>
        opts?.rev ? b[1] - a[1] : a[1] - b[1],
      );
      return entries.slice(start, stop + 1).map(([m]) => m);
    },
    async mget<T = unknown>(...keys: string[]): Promise<Array<T | null>> {
      return keys.map((k) => (store.has(k) ? (store.get(k) as T) : null));
    },
  };
}

const URL1 = "https://example.com/feed.xml";
const URL2 = "https://other.com/rss";
const URL3 = "https://third.com/atom";

describe("UpstashCatalogAdapter", () => {
  describe("upsert", () => {
    it("creates a new feed entry with requestCount=1 and status=active", async () => {
      const client = fakeClient();
      const adapter = new UpstashCatalogAdapter(client);
      const result = await adapter.upsert(URL1);
      expect(result.ok).toBe(true);

      const got = await adapter.get(URL1);
      expect(got.ok).toBe(true);
      if (!got.ok) return;
      expect(got.value).not.toBeNull();
      expect(got.value!.url).toBe(URL1);
      expect(got.value!.requestCount).toBe(1);
      expect(got.value!.status).toBe("active");
      expect(got.value!.title).toBeNull();
    });

    it("increments requestCount on subsequent upserts of the same URL", async () => {
      const client = fakeClient();
      const adapter = new UpstashCatalogAdapter(client);
      await adapter.upsert(URL1);
      await adapter.upsert(URL1);
      await adapter.upsert(URL1);

      const got = await adapter.get(URL1);
      if (!got.ok) return;
      expect(got.value!.requestCount).toBe(3);
    });

    it("keeps the sorted-set ranking in sync with requestCount", async () => {
      const client = fakeClient();
      const adapter = new UpstashCatalogAdapter(client);
      await adapter.upsert(URL1); // count 1
      await adapter.upsert(URL2); // count 1
      await adapter.upsert(URL1); // count 2
      await adapter.upsert(URL1); // count 3
      await adapter.upsert(URL2); // count 2

      // The ranking sorted set must reflect the current counts so popular()
      // returns the right order without scanning all entries.
      expect(client.zset.get(URL1)).toBe(3);
      expect(client.zset.get(URL2)).toBe(2);
    });

    it("returns Result.err when the underlying client throws", async () => {
      const broken: UpstashCatalogClient = {
        async get() { return null; },
        async set() { throw new Error("redis error"); },
        async zadd() { return 0; },
        async zcard() { return 0; },
        async zrange() { return []; },
        async mget() { return []; },
      };
      const result = await new UpstashCatalogAdapter(broken).upsert(URL1);
      expect(result.ok).toBe(false);
    });
  });

  describe("get", () => {
    it("returns ok(null) for an unknown URL", async () => {
      const client = fakeClient();
      const adapter = new UpstashCatalogAdapter(client);
      const result = await adapter.get(URL1);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBeNull();
    });
  });

  describe("popular", () => {
    it("returns the top N feeds by requestCount descending", async () => {
      const client = fakeClient();
      const adapter = new UpstashCatalogAdapter(client);
      // URL2: 5 requests, URL1: 3 requests, URL3: 1 request
      for (let i = 0; i < 5; i++) await adapter.upsert(URL2);
      for (let i = 0; i < 3; i++) await adapter.upsert(URL1);
      await adapter.upsert(URL3);

      const result = await adapter.popular(2);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
      expect(result.value[0].url).toBe(URL2);
      expect(result.value[0].requestCount).toBe(5);
      expect(result.value[1].url).toBe(URL1);
      expect(result.value[1].requestCount).toBe(3);
    });

    it("returns empty array when no feeds are known", async () => {
      const adapter = new UpstashCatalogAdapter(fakeClient());
      const result = await adapter.popular(10);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });

    it("uses MGET to batch the per-URL detail fetches (no N+1 round trips)", async () => {
      // Production-perf invariant: popular() looks up N URLs via the sorted
      // set then fetches their entries. If we do N separate GETs, that's
      // N round trips. Using MGET collapses to 1 round trip.
      const client = fakeClient();
      let mgetCalls = 0;
      const original = client.mget.bind(client);
      client.mget = async <T = unknown>(...keys: string[]) => {
        mgetCalls++;
        return original<T>(...keys);
      };
      const adapter = new UpstashCatalogAdapter(client);
      await adapter.upsert(URL1);
      await adapter.upsert(URL2);
      await adapter.upsert(URL3);

      mgetCalls = 0; // reset after the upserts
      await adapter.popular(10);
      expect(mgetCalls).toBe(1);
    });
  });

  describe("count", () => {
    it("returns ZCARD of the ranking set (O(1), not a full scan)", async () => {
      const client = fakeClient();
      const adapter = new UpstashCatalogAdapter(client);
      await adapter.upsert(URL1);
      await adapter.upsert(URL2);
      await adapter.upsert(URL3);

      const result = await adapter.count();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(3);
    });

    it("returns 0 when no feeds are known", async () => {
      const adapter = new UpstashCatalogAdapter(fakeClient());
      const result = await adapter.count();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(0);
    });
  });

  describe("updateMetadata", () => {
    it("merges fields into an existing entry", async () => {
      const client = fakeClient();
      const adapter = new UpstashCatalogAdapter(client);
      await adapter.upsert(URL1);
      const result = await adapter.updateMetadata(URL1, {
        title: "Example Feed",
        description: "Test description",
        siteUrl: "https://example.com",
      });
      expect(result.ok).toBe(true);

      const got = await adapter.get(URL1);
      if (!got.ok) return;
      expect(got.value!.title).toBe("Example Feed");
      expect(got.value!.description).toBe("Test description");
      expect(got.value!.siteUrl).toBe("https://example.com");
      // requestCount must be preserved.
      expect(got.value!.requestCount).toBe(1);
    });

    it("is a no-op when the feed doesn't exist (avoids creating partial entries)", async () => {
      const client = fakeClient();
      const adapter = new UpstashCatalogAdapter(client);
      const result = await adapter.updateMetadata(URL1, { title: "Test" });
      expect(result.ok).toBe(true);
      // No entry created.
      const got = await adapter.get(URL1);
      if (!got.ok) return;
      expect(got.value).toBeNull();
    });
  });

  describe("keyspace isolation", () => {
    it("only writes keys under the catalog: prefix (no collision with license/sync namespaces)", async () => {
      const client = fakeClient();
      const adapter = new UpstashCatalogAdapter(client);
      await adapter.upsert(URL1);
      const keys = [...client.store.keys()];
      expect(keys.every((k) => k.startsWith("catalog:"))).toBe(true);
      // The ranking sorted set also uses the catalog: prefix.
      expect(keys.some((k) => k.startsWith("license:") || k.startsWith("vault:"))).toBe(false);
    });
  });
});
