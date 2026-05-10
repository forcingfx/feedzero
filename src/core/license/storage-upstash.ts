/**
 * Upstash Redis-backed LicenseStorage.
 *
 * Production storage for license records and the revocation deny-list. Wired
 * via the Vercel Marketplace Upstash integration (which injects
 * UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN). Client construction
 * lives in {@link createUpstashLicenseStorage} below; the adapter itself
 * accepts an injected client so it stays trivially testable with a fake.
 *
 * Key layout (chosen for simple O(1) lookups + a customer→keyIds index):
 *   license:record:<keyId>     — JSON LicenseRecord
 *   license:revoked:<keyId>    — reason string (presence == revoked)
 *   customer:<customerId>:keys — Redis SET of keyIds for that customer
 *
 * Why a separate customer-index set: the LicenseStorage contract requires
 * `listByCustomer` and `revokeAllForCustomer`. Without an index we'd have to
 * SCAN every record on every Stripe `customer.subscription.deleted` event —
 * O(n) over the entire user base. The set keeps it O(records-per-customer).
 *
 * Audit invariant: revocations are write-only. There is no `unrevoke` and
 * `put` does not clear an existing deny-list entry. See
 * `tests/core/license/storage.test.ts` for the contract pinning this.
 */

import { type Result, ok, err } from "../../utils/result";
import {
  type LicenseRecord,
  type LicenseStorage,
} from "./storage";

/**
 * Minimal subset of the Upstash Redis client we depend on. Defining it here
 * (instead of importing from `@upstash/redis`) means the adapter can be
 * unit-tested with a fake AND the production wrapper can pass the real
 * client through unmodified — both shapes match this interface.
 */
export interface UpstashClient {
  // Returns the parsed JSON value or null. The Upstash SDK widens the return
  // to `Promise<unknown>` because it auto-deserializes; we narrow to a typed
  // record at the call site via the generic.
  get<T = unknown>(key: string): Promise<T | null>;
  // Upstash returns `"OK"` on success but the SDK types it `Promise<unknown>`
  // because of optional NX/XX flags. We don't read the return value, so the
  // permissive type is fine.
  set(key: string, value: unknown): Promise<unknown>;
  sadd(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  exists(key: string): Promise<number>;
}

const RECORD_PREFIX = "license:record:";
const REVOKED_PREFIX = "license:revoked:";
const CUSTOMER_INDEX_PREFIX = "customer:";
const CUSTOMER_INDEX_SUFFIX = ":keys";

function recordKey(keyId: string): string {
  return RECORD_PREFIX + keyId;
}
function revokedKey(keyId: string): string {
  return REVOKED_PREFIX + keyId;
}
function customerIndexKey(customerId: string): string {
  return CUSTOMER_INDEX_PREFIX + customerId + CUSTOMER_INDEX_SUFFIX;
}

/**
 * Wrap an async Upstash call so any thrown error becomes a Result.err with
 * the original message. Centralised so callers don't repeat try/catch and
 * the error surface is uniform.
 */
async function tryUpstash<T>(op: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await op());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`upstash storage error: ${message}`);
  }
}

export class UpstashLicenseStorage implements LicenseStorage {
  constructor(private readonly client: UpstashClient) {}

  async put(record: LicenseRecord): Promise<Result<void>> {
    return tryUpstash(async () => {
      // Upstash auto-serializes objects to JSON; we pass the record as-is.
      await this.client.set(recordKey(record.keyId), record);
      // Maintain the customer→keyIds index so listByCustomer is O(records-per-customer).
      await this.client.sadd(customerIndexKey(record.customerId), record.keyId);
    });
  }

  async get(keyId: string): Promise<Result<LicenseRecord | null>> {
    return tryUpstash(() => this.client.get<LicenseRecord>(recordKey(keyId)));
  }

  async listByCustomer(
    customerId: string,
  ): Promise<Result<LicenseRecord[]>> {
    const keysResult = await tryUpstash(() =>
      this.client.smembers(customerIndexKey(customerId)),
    );
    if (!keysResult.ok) return keysResult;

    const records: LicenseRecord[] = [];
    for (const keyId of keysResult.value) {
      const recordResult = await this.get(keyId);
      if (!recordResult.ok) return recordResult;
      // Defensive: index entries can outlive deleted records (eventual cleanup).
      // Skip rather than fail — the caller wants what currently exists.
      if (recordResult.value !== null) records.push(recordResult.value);
    }
    return ok(records);
  }

  async revoke(keyId: string, reason: string): Promise<Result<void>> {
    return tryUpstash(async () => {
      await this.client.set(revokedKey(keyId), reason);
    });
  }

  async revokeAllForCustomer(
    customerId: string,
    reason: string,
  ): Promise<Result<void>> {
    const keysResult = await tryUpstash(() =>
      this.client.smembers(customerIndexKey(customerId)),
    );
    if (!keysResult.ok) return keysResult;

    for (const keyId of keysResult.value) {
      const revokeResult = await this.revoke(keyId, reason);
      if (!revokeResult.ok) return revokeResult;
    }
    return ok(undefined);
  }

  async isRevoked(keyId: string): Promise<Result<boolean>> {
    const result = await tryUpstash(() =>
      this.client.exists(revokedKey(keyId)),
    );
    if (!result.ok) return result;
    return ok(result.value === 1);
  }
}

/**
 * Resolve Upstash REST credentials from either naming convention.
 *
 * Vercel's Marketplace Upstash integration auto-injects the legacy Vercel-KV
 * names (KV_REST_API_URL / KV_REST_API_TOKEN) — both pairs point at the same
 * Upstash REST endpoint, so we honor either. Canonical UPSTASH_* names take
 * precedence when both are set, on the principle that an explicit override
 * should beat an auto-injected default.
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
export function hasUpstashCredentials(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveUpstashCredentials(env) !== null;
}

/**
 * Build an UpstashLicenseStorage backed by the real `@upstash/redis` client.
 * Reads credentials from `UPSTASH_REDIS_REST_URL`/`_TOKEN` or, if absent,
 * the Vercel-Marketplace-injected `KV_REST_API_URL`/`_TOKEN`. Throws if
 * neither pair is present — fail-fast at startup is preferable to a silent
 * no-op store.
 */
export async function createUpstashLicenseStorage(
  env: Record<string, string | undefined> = process.env,
): Promise<UpstashLicenseStorage> {
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
  return new UpstashLicenseStorage(
    new Redis({ url: creds.url, token: creds.token }),
  );
}
