/**
 * Upstash-backed CatalogStorageAdapter.
 *
 * Replaces the previous memory-only adapter that silently lost all catalog
 * data on every Vercel Lambda cold start (~15min idle window). The new
 * adapter persists to the same Upstash KV instance as license storage,
 * Stripe event-id dedup, and (post-PR-#45) vault sync.
 *
 * Key layout:
 *   catalog:feed:<url>   — JSON CatalogFeed for one known feed URL
 *   catalog:ranking      — Redis sorted set: members = feed URLs,
 *                          scores = requestCount. Enables O(log N) inserts
 *                          and O(top-K + lookup) reads for popular().
 *
 * Performance shape:
 *   - upsert: 1 GET + 1 SET + 1 ZADD. Pipelined under one HTTP request when
 *     possible, but Upstash's REST client doesn't expose pipelines for
 *     ZADD+SET in a single call, so today this is 3 round trips. The
 *     constant factor isn't load-bearing at FeedZero's scale.
 *   - get: 1 GET.
 *   - popular(N): 1 ZRANGE + 1 MGET (NOT N+1 individual GETs).
 *   - count: 1 ZCARD (O(1) on the sorted set's size counter).
 *
 * Keyspace isolation: only writes keys under the `catalog:` prefix.
 * No collision possible with `license:*` (license adapter), `vault:*`
 * (sync adapter from PR #45), or `customer:*` (license customer index).
 */

import { type Result, ok, err } from "../../../../packages/core/src/utils/result";
import type {
  CatalogFeed,
  CatalogStorageAdapter,
} from "../catalog-types";

/**
 * Minimal subset of the Upstash Redis client the catalog adapter needs.
 * Defined inline so the adapter can be unit-tested with a fake AND the
 * production wrapper can pass the real `@upstash/redis` client unchanged.
 */
export interface UpstashCatalogClient {
  get<T = unknown>(key: string): Promise<T | null>;
  set(
    key: string,
    value: unknown,
    opts?: { nx?: boolean; ex?: number },
  ): Promise<unknown>;
  /**
   * Add or update a member's score in a sorted set. Returns the number
   * of new elements added (Upstash returns `null` in some no-op edge
   * cases — we don't read the return value, so widening to allow null
   * keeps the interface compatible with the real `@upstash/redis` shape).
   */
  zadd(
    key: string,
    scoreMember: { score: number; member: string },
  ): Promise<number | null>;
  /** Cardinality (member count) of a sorted set — O(1). */
  zcard(key: string): Promise<number>;
  /**
   * Range of members from a sorted set. `rev: true` walks from highest
   * score downward (what popular() needs).
   */
  zrange(
    key: string,
    start: number,
    stop: number,
    opts?: { rev?: boolean },
  ): Promise<string[]>;
  /** Batch GET — N keys in one round trip. */
  mget<T = unknown>(...keys: string[]): Promise<Array<T | null>>;
}

const FEED_KEY_PREFIX = "catalog:feed:";
const RANKING_KEY = "catalog:ranking";

function feedKey(url: string): string {
  return FEED_KEY_PREFIX + url;
}

/**
 * Wrap an async Upstash call so any thrown error becomes a Result.err
 * with the original message. Same pattern as `tryUpstash` in the license
 * and sync adapters.
 */
async function tryUpstash<T>(op: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await op());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`upstash catalog error: ${message}`);
  }
}

export class UpstashCatalogAdapter implements CatalogStorageAdapter {
  constructor(private readonly client: UpstashCatalogClient) {}

  async upsert(url: string): Promise<Result<true>> {
    return tryUpstash(async () => {
      const now = new Date().toISOString();
      const existing = await this.client.get<CatalogFeed>(feedKey(url));
      const updated: CatalogFeed = existing
        ? {
            ...existing,
            requestCount: existing.requestCount + 1,
            lastRequestedAt: now,
          }
        : {
            url,
            title: null,
            description: null,
            siteUrl: null,
            status: "active",
            requestCount: 1,
            lastRequestedAt: now,
            lastCrawledAt: null,
            errorCount: 0,
            lastError: null,
            createdAt: now,
          };

      await this.client.set(feedKey(url), updated);
      // Keep the sorted-set ranking in sync. ZADD with an existing member
      // overwrites its score, so we don't need to ZREM first.
      await this.client.zadd(RANKING_KEY, {
        score: updated.requestCount,
        member: url,
      });
      return true as const;
    });
  }

  async get(url: string): Promise<Result<CatalogFeed | null>> {
    return tryUpstash(async () => {
      const value = await this.client.get<CatalogFeed>(feedKey(url));
      return value ?? null;
    });
  }

  async popular(limit: number): Promise<Result<CatalogFeed[]>> {
    return tryUpstash(async () => {
      // 1. ZRANGE the top N URLs by score (descending).
      const urls = await this.client.zrange(RANKING_KEY, 0, limit - 1, {
        rev: true,
      });
      if (urls.length === 0) return [];

      // 2. MGET all entries in one round trip. Skip null entries — they
      //    represent ranking-set members whose detail rows have been GC'd
      //    or were never written (defensive; should be impossible under
      //    normal operation).
      const keys = urls.map(feedKey);
      const entries = await this.client.mget<CatalogFeed>(...keys);
      return entries.filter((e): e is CatalogFeed => e !== null);
    });
  }

  async updateMetadata(
    url: string,
    metadata: Partial<
      Pick<
        CatalogFeed,
        | "title"
        | "description"
        | "siteUrl"
        | "status"
        | "lastCrawledAt"
        | "errorCount"
        | "lastError"
      >
    >,
  ): Promise<Result<true>> {
    return tryUpstash(async () => {
      const existing = await this.client.get<CatalogFeed>(feedKey(url));
      // No-op on missing — avoids creating partial entries with only
      // metadata fields and no requestCount (which would skew popular()).
      if (!existing) return true as const;
      const merged: CatalogFeed = { ...existing, ...metadata };
      await this.client.set(feedKey(url), merged);
      return true as const;
    });
  }

  async count(): Promise<Result<number>> {
    return tryUpstash(() => this.client.zcard(RANKING_KEY));
  }
}

/**
 * Resolve Upstash REST credentials from either naming convention. Mirrors
 * `resolveUpstashCredentials` in license/storage-upstash.ts — operators
 * configure once and all three adapters (license, sync, catalog) pick it up.
 */
function resolveUpstashCredentials(
  env: Record<string, string | undefined>,
): { url: string; token: string } | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

/** True iff the env carries a usable Upstash REST credential pair. */
export function hasUpstashCatalogCredentials(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveUpstashCredentials(env) !== null;
}

/**
 * Build an `UpstashCatalogAdapter` backed by the real `@upstash/redis`
 * client. Throws if Upstash credentials are not configured — fail-fast
 * at startup is preferable to a silent no-op store (which is precisely
 * the failure mode the previous memory-only adapter exhibited).
 */
export async function createUpstashCatalogAdapter(
  env: Record<string, string | undefined> = process.env,
): Promise<UpstashCatalogAdapter> {
  const creds = resolveUpstashCredentials(env);
  if (!creds) {
    throw new Error(
      "Upstash REST credentials not found. Set UPSTASH_REDIS_REST_URL + " +
        "UPSTASH_REDIS_REST_TOKEN, or use the Vercel Marketplace Upstash " +
        "integration which auto-injects KV_REST_API_URL + KV_REST_API_TOKEN.",
    );
  }
  const { Redis } = await import("@upstash/redis");
  return new UpstashCatalogAdapter(
    new Redis({ url: creds.url, token: creds.token }),
  );
}
