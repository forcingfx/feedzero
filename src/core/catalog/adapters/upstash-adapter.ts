/**
 * Upstash-backed CatalogStorageAdapter.
 *
 * Replaces the previous memory-only adapter that silently lost all catalog
 * data on every Vercel Lambda cold start (~15min idle window). The new
 * adapter persists to the same Upstash KV instance as license storage,
 * Stripe event-id dedup, and (post-PR-#45) vault sync.
 *
 * Key layout:
 *   catalog:feed:<url>   — JSON metadata record for one known feed URL,
 *                          written once (SET NX) and then only by
 *                          updateMetadata. No TTL: one key per unique URL.
 *   catalog:ranking      — Redis sorted set: members = feed URLs,
 *                          scores = request count. The score is the ONLY
 *                          source of requestCount; any requestCount field
 *                          on a stored record is a pre-ZINCRBY leftover and
 *                          is ignored on read.
 *
 * Command cost (Upstash bills per command; upsert runs on every 2xx
 * /api/feed fetch, so it is the hot path):
 *   - upsert: 1 SET NX + 1 ZINCRBY. No read-modify-write, no GET.
 *   - get: 1 GET + 1 ZSCORE.
 *   - popular(N): 1 ZRANGE WITHSCORES + 1 MGET (NOT N+1 individual GETs).
 *   - count: 1 ZCARD (O(1) on the sorted set's size counter).
 *
 * There is no lastRequestedAt: keeping it current would cost a write per
 * fetch, which is exactly what this layout removes (see ADR 008).
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
  /** Add `increment` to a member's score (creating it at 0). Returns the new score. */
  zincrby(key: string, increment: number, member: string): Promise<number>;
  /** A member's score, or null when it is not in the set. */
  zscore(key: string, member: string): Promise<number | null>;
  /** Cardinality (member count) of a sorted set — O(1). */
  zcard(key: string): Promise<number>;
  /**
   * Range of members from a sorted set. `rev: true` walks from highest
   * score downward (what popular() needs). With `withScores: true` the
   * reply is flat: [member, score, member, score, ...].
   */
  zrange(
    key: string,
    start: number,
    stop: number,
    opts?: { rev?: boolean; withScores?: boolean },
  ): Promise<unknown[]>;
  /** Batch GET — N keys in one round trip. */
  mget<T = unknown>(...keys: string[]): Promise<Array<T | null>>;
}

const FEED_KEY_PREFIX = "catalog:feed:";
const RANKING_KEY = "catalog:ranking";

function feedKey(url: string): string {
  return FEED_KEY_PREFIX + url;
}

/**
 * What a `catalog:feed:<url>` key holds. Records written before the
 * ZINCRBY change also carry `requestCount` and `lastRequestedAt`;
 * `toCatalogFeed` drops both.
 */
type CatalogRecord = Omit<CatalogFeed, "requestCount">;

function newRecord(url: string): CatalogRecord {
  return {
    url,
    title: null,
    description: null,
    siteUrl: null,
    status: "active",
    lastCrawledAt: null,
    errorCount: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
  };
}

/** Build the public shape from a stored record and its ranking score. */
function toCatalogFeed(record: CatalogRecord, score: unknown): CatalogFeed {
  return {
    url: record.url,
    title: record.title,
    description: record.description,
    siteUrl: record.siteUrl,
    status: record.status,
    requestCount: Number(score ?? 0),
    lastCrawledAt: record.lastCrawledAt,
    errorCount: record.errorCount,
    lastError: record.lastError,
    createdAt: record.createdAt,
  };
}

/** Split a flat ZRANGE WITHSCORES reply into [member, score] pairs. */
function pairMembersWithScores(flat: unknown[]): Array<[string, unknown]> {
  const pairs: Array<[string, unknown]> = [];
  for (let i = 0; i < flat.length; i += 2) {
    pairs.push([String(flat[i]), flat[i + 1]]);
  }
  return pairs;
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
      // SET NX creates the record on first sighting and is a no-op after,
      // so metadata written by updateMetadata is never clobbered.
      await this.client.set(feedKey(url), newRecord(url), { nx: true });
      await this.client.zincrby(RANKING_KEY, 1, url);
      return true as const;
    });
  }

  async get(url: string): Promise<Result<CatalogFeed | null>> {
    return tryUpstash(async () => {
      const [record, score] = await Promise.all([
        this.client.get<CatalogRecord>(feedKey(url)),
        this.client.zscore(RANKING_KEY, url),
      ]);
      return record ? toCatalogFeed(record, score) : null;
    });
  }

  async popular(limit: number): Promise<Result<CatalogFeed[]>> {
    return tryUpstash(async () => {
      const ranked = pairMembersWithScores(
        await this.client.zrange(RANKING_KEY, 0, limit - 1, {
          rev: true,
          withScores: true,
        }),
      );
      if (ranked.length === 0) return [];

      // One MGET for all records. Skip ranking members without a record
      // (defensive: upsert runs SET NX before ZINCRBY, so a missing record
      // means a key was deleted out of band).
      const records = await this.client.mget<CatalogRecord>(
        ...ranked.map(([url]) => feedKey(url)),
      );
      return ranked.flatMap(([, score], i) => {
        const record = records[i];
        return record ? [toCatalogFeed(record, score)] : [];
      });
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
      const existing = await this.client.get<CatalogRecord>(feedKey(url));
      // No-op on missing — avoids creating entries for URLs nobody fetched.
      if (!existing) return true as const;
      const merged: CatalogRecord = { ...existing, ...metadata };
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
