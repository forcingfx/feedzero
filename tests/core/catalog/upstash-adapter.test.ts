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

/**
 * In-memory fake of the small Upstash subset the adapter needs. It records
 * every command name in `commands` because Upstash bills per command:
 * the command count of a hot path is a production cost, so tests assert it.
 */
function fakeClient(): UpstashCatalogClient & {
  store: Map<string, unknown>;
  zset: Map<string, number>;
  commands: string[];
} {
  const store = new Map<string, unknown>();
  const zset = new Map<string, number>(); // member -> score
  const commands: string[] = [];
  const rankedDesc = () => [...zset.entries()].sort((a, b) => b[1] - a[1]);
  return {
    store,
    zset,
    commands,
    async get<T = unknown>(key: string): Promise<T | null> {
      commands.push("get");
      return store.has(key) ? (store.get(key) as T) : null;
    },
    async set(key, value, opts) {
      commands.push(opts?.nx ? "set nx" : "set");
      if (opts?.nx && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
    async zincrby(_key, increment, member) {
      commands.push("zincrby");
      const score = (zset.get(member) ?? 0) + increment;
      zset.set(member, score);
      return score;
    },
    async zscore(_key, member) {
      commands.push("zscore");
      return zset.get(member) ?? null;
    },
    async zcard(_key) {
      commands.push("zcard");
      return zset.size;
    },
    async zrange(_key, start, stop, opts) {
      // The adapter always walks the ranking highest-first. Real Upstash
      // returns a flat [member, score, member, score, ...] with withScores.
      commands.push("zrange");
      const entries = opts?.rev ? rankedDesc() : rankedDesc().reverse();
      const slice = entries.slice(start, stop + 1);
      return opts?.withScores ? slice.flat() : slice.map(([m]) => m);
    },
    async mget<T = unknown>(...keys: string[]): Promise<Array<T | null>> {
      commands.push("mget");
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

    it("issues at most 2 Upstash commands per upsert and never a GET (billed per command)", async () => {
      // Every 2xx /api/feed fetch upserts, so this is the hottest Upstash
      // path in the app. The previous read-modify-write (GET + SET + ZADD)
      // spent 3 commands per fetch and exhausted the paid plan.
      const client = fakeClient();
      const adapter = new UpstashCatalogAdapter(client);

      await adapter.upsert(URL1); // first sighting
      expect(client.commands.length).toBeLessThanOrEqual(2);
      expect(client.commands).not.toContain("get");

      client.commands.length = 0;
      await adapter.upsert(URL1); // repeat sighting
      expect(client.commands.length).toBeLessThanOrEqual(2);
      expect(client.commands).not.toContain("get");
    });

    it("never overwrites an existing record (metadata written by updateMetadata survives)", async () => {
      const client = fakeClient();
      const adapter = new UpstashCatalogAdapter(client);
      await adapter.upsert(URL1);
      await adapter.updateMetadata(URL1, { title: "Example Feed" });
      await adapter.upsert(URL1);

      const got = await adapter.get(URL1);
      if (!got.ok) throw new Error(got.error);
      expect(got.value!.title).toBe("Example Feed");
      expect(got.value!.requestCount).toBe(2);
    });

    it("returns Result.err when the underlying client throws", async () => {
      const broken: UpstashCatalogClient = {
        async get() { return null; },
        async set() { throw new Error("redis error"); },
        async zincrby() { return 0; },
        async zscore() { return null; },
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

  describe("records written before the ZINCRBY change", () => {
    // Production holds records written by the old GET+SET+ZADD upsert:
    // they carry a requestCount field and a lastRequestedAt timestamp. The
    // ranking score is the only count that keeps moving now, so reads must
    // take the count from it and must not echo a lastRequestedAt that is
    // no longer updated (it would silently lie about recency).
    function seedLegacy(client: ReturnType<typeof fakeClient>, score: number) {
      client.store.set("catalog:feed:" + URL1, {
        url: URL1,
        title: "Legacy",
        description: null,
        siteUrl: null,
        status: "active",
        requestCount: 7,
        lastRequestedAt: "2026-05-01T00:00:00.000Z",
        lastCrawledAt: null,
        errorCount: 0,
        lastError: null,
        createdAt: "2026-04-01T00:00:00.000Z",
      });
      client.zset.set(URL1, score);
    }

    it("get() reports the ranking score as requestCount and omits lastRequestedAt", async () => {
      const client = fakeClient();
      seedLegacy(client, 7);
      const adapter = new UpstashCatalogAdapter(client);
      await adapter.upsert(URL1);

      const got = await adapter.get(URL1);
      if (!got.ok) throw new Error(got.error);
      expect(got.value!.requestCount).toBe(8);
      expect(got.value!.title).toBe("Legacy");
      expect(got.value).not.toHaveProperty("lastRequestedAt");
    });

    it("popular() reports the ranking score as requestCount", async () => {
      const client = fakeClient();
      seedLegacy(client, 7);
      const adapter = new UpstashCatalogAdapter(client);
      await adapter.upsert(URL1);
      await adapter.upsert(URL1);

      const result = await adapter.popular(5);
      if (!result.ok) throw new Error(result.error);
      expect(result.value[0].requestCount).toBe(9);
      expect(result.value[0]).not.toHaveProperty("lastRequestedAt");
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
