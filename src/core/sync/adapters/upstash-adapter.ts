/**
 * Upstash-backed SyncStorageAdapter.
 *
 * Stores encrypted vault payloads under the namespaced key `vault:<vaultId>`
 * in the same Upstash KV instance that serves license storage and Stripe
 * event-id dedup. Consolidating to one production storage backend removes
 * the operator surface that caused yesterday's 2026-05-12 sync regression
 * (stale `SYNC_STORAGE` override silently routing PUTs to the filesystem
 * adapter while Vercel Blob's `Needs Attention` flag was firing in parallel).
 *
 * Keyspace isolation: this adapter only ever writes `vault:*` keys. The
 * license adapter writes `license:*` and `customer:*`. vaultIds are
 * 64-hex-char strings enforced by `VAULT_ID_PATTERN` in `sync-handler.ts`,
 * so collisions with the license namespace are structurally impossible.
 * See `tests/core/sync/adapters/upstash-adapter.test.ts` for the pinning.
 *
 * Pagination contract: `count()` uses Redis SCAN, never KEYS. KEYS blocks
 * Redis on large keyspaces and is explicitly discouraged by Upstash's docs.
 * SCAN paginates via cursor — the adapter iterates until cursor === 0,
 * accumulating keys across pages. A naive single-page read would silently
 * undercount once we cross the page size threshold (~100 keys).
 *
 * Client construction lives in `createUpstashSyncAdapter` at the bottom —
 * the adapter itself accepts an injected client so tests stay trivially
 * mockable. This mirrors `storage-upstash.ts` exactly so future readers
 * recognize the pattern.
 */

import { type Result, ok, err } from "../../../../packages/core/src/utils/result";
import type { SyncStorageAdapter } from "../types";

/**
 * Minimal subset of the Upstash Redis client we depend on. Defined inline
 * (not imported from `@upstash/redis`) so the adapter can be unit-tested
 * with a fake AND the production wrapper can pass the real client through
 * unmodified — both shapes match this interface.
 *
 * Why a sync-specific interface instead of reusing the license module's
 * `UpstashClient`: the operations differ. Sync needs SCAN + DEL; license
 * needs SADD + SMEMBERS + EXISTS. Defining the minimal contract per
 * adapter keeps each one easy to reason about in isolation.
 */
export interface UpstashSyncClient {
  /** Returns the string value or null if the key doesn't exist. */
  get<T = string>(key: string): Promise<T | null>;
  /** Returns "OK" on success. The optional opts bag matches the wider Upstash SDK. */
  set(
    key: string,
    value: unknown,
    opts?: { nx?: boolean; ex?: number },
  ): Promise<unknown>;
  /** Returns the number of keys deleted (0 or 1 for a single-key call). */
  del(key: string): Promise<number>;
  /**
   * Paginated keyspace scan. Returns [nextCursor, keys]. Iteration is
   * complete when nextCursor === 0 (or "0" as a string — Upstash's REST API
   * returns the cursor stringified). The adapter handles both.
   */
  scan(
    cursor: number | string,
    opts?: { match?: string; count?: number },
  ): Promise<[number | string, string[]]>;
}

const VAULT_KEY_PREFIX = "vault:";
const SCAN_PAGE_SIZE = 100;
// Singleton meta key tracking the most recent PUT time (epoch ms as a
// stringified number). Written synchronously inside `put()` so the value
// always reflects the most recent successful write. Lives in the same
// keyspace as vault payloads but cannot collide with a vault: VAULT_KEY_PREFIX
// applies to a 64-hex vaultId, this key is a fixed namespaced literal.
const LAST_UPDATED_KEY = "vault-meta:lastUpdatedAt";

function vaultKey(vaultId: string): string {
  return VAULT_KEY_PREFIX + vaultId;
}

/**
 * Wrap an async Upstash call so any thrown error becomes a Result.err with
 * the original message. Same pattern as `tryUpstash` in storage-upstash.ts.
 */
async function tryUpstash<T>(op: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await op());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`upstash sync error: ${message}`);
  }
}

export class UpstashSyncAdapter implements SyncStorageAdapter {
  constructor(private readonly client: UpstashSyncClient) {}

  async get(vaultId: string): Promise<Result<string | null>> {
    return tryUpstash(async () => {
      const value = await this.client.get<string>(vaultKey(vaultId));
      if (value === null || value === undefined) return null;
      // Defensive re-stringification. The production Upstash client is
      // constructed with `automaticDeserialization: false` so this branch
      // is normally a no-op (`typeof value === "string"`). But if a
      // future SDK upgrade, env-tweak, or refactor reintroduces
      // auto-deserialization, we still return a string here — without
      // this, `Response(obj)` renders the literal "[object Object]"
      // and every cloud-pull silently corrupts the vault. Belt and
      // suspenders. See the unit regression test in this file's
      // "auto-deserialization off" describe block.
      return typeof value === "string" ? value : JSON.stringify(value);
    });
  }

  async put(vaultId: string, data: string): Promise<Result<boolean>> {
    return tryUpstash(async () => {
      await this.client.set(vaultKey(vaultId), data);
      // Best-effort meta write. We deliberately don't roll back the vault
      // SET on meta failure — the vault is the source of truth; the meta
      // key is observability only. A failed meta write surfaces as a stale
      // lastUpdatedAt on /stats but never as data loss.
      try {
        await this.client.set(LAST_UPDATED_KEY, String(Date.now()));
      } catch {
        /* observability-only, see comment above */
      }
      return true;
    });
  }

  async delete(vaultId: string): Promise<Result<boolean>> {
    return tryUpstash(async () => {
      await this.client.del(vaultKey(vaultId));
      // Idempotent: SyncStorageAdapter.delete returns ok whether the key
      // existed or not. Mirrors filesystem/blob adapter contracts.
      return true;
    });
  }

  async count(): Promise<Result<number>> {
    return tryUpstash(async () => {
      let cursor: number | string = 0;
      let total = 0;
      do {
        const [nextCursor, keys] = await this.client.scan(cursor, {
          match: `${VAULT_KEY_PREFIX}*`,
          count: SCAN_PAGE_SIZE,
        });
        total += keys.length;
        cursor = nextCursor;
        // Upstash REST returns cursor as a string "0" to mean "done". Be
        // defensive and treat both 0 and "0" as completion.
      } while (cursor !== 0 && cursor !== "0");
      return total;
    });
  }

  async lastUpdatedAt(): Promise<Result<number | null>> {
    return tryUpstash(async () => {
      const raw = await this.client.get<string>(LAST_UPDATED_KEY);
      if (raw === null || raw === undefined) return null;
      const ms = Number(raw);
      // Defensive: if a future SDK upgrade or operator-side `redis-cli SET`
      // writes garbage into the meta key, return null rather than NaN —
      // the JSON response stays parseable on the client.
      return Number.isFinite(ms) ? ms : null;
    });
  }
}

/**
 * Resolve Upstash REST credentials from either naming convention. Same
 * cascade as the license module so operators can configure once and have
 * both license + sync adapters pick it up.
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
export function hasUpstashSyncCredentials(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveUpstashCredentials(env) !== null;
}

/**
 * Build an UpstashSyncAdapter backed by the real `@upstash/redis` client.
 * Throws if Upstash credentials are not configured — fail-fast at startup
 * is preferable to a silent no-op store.
 */
export async function createUpstashSyncAdapter(
  env: Record<string, string | undefined> = process.env,
): Promise<UpstashSyncAdapter> {
  const creds = resolveUpstashCredentials(env);
  if (!creds) {
    throw new Error(
      "Upstash REST credentials not found. Set UPSTASH_REDIS_REST_URL + " +
        "UPSTASH_REDIS_REST_TOKEN, or use the Vercel Marketplace Upstash " +
        "integration which auto-injects KV_REST_API_URL + KV_REST_API_TOKEN.",
    );
  }
  // Dynamic import keeps the SDK out of the dev/test path when Upstash is
  // not configured — Vite would otherwise eagerly bundle it.
  const { Redis } = await import("@upstash/redis");
  return new UpstashSyncAdapter(
    new Redis({
      url: creds.url,
      token: creds.token,
      // CRITICAL: vault payloads are already JSON-serialized strings
      // produced by `sync-handler.ts:handlePut` and consumed by GET as
      // raw strings. The Upstash SDK's default behavior is to auto-parse
      // any stored string that looks like JSON back into a JS object on
      // GET — that turns our `'{"ok":true,"vault":{...}}'` string into
      // an Object, which `new Response(obj, ...)` then renders as the
      // literal `"[object Object]"`. Bug live since PR #45; caught only
      // by the post-deploy smoke test in `tests/smoke/sync.test.ts`.
      // See README of @upstash/redis for the flag's full semantics.
      automaticDeserialization: false,
    }),
  );
}
