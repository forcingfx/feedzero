/**
 * Read-only census of the shared Upstash keyspace: how many keys of each
 * kind exist and how many bytes they hold.
 *
 * Exists because the Upstash plan ran out of storage and nothing in the
 * app reports what fills it. Every writer shares one database (vaults,
 * catalog, licenses, Stripe dedup, rate limits), and only some of them
 * set a TTL, so the answer has to come from the keyspace itself.
 *
 * Pure library over an injected client, so it is testable without the
 * SDK; the CLI shell is `scripts/storage-census.ts`. Mirrors the
 * `sentinel-cleanup.ts` / `cleanup-sentinel-vaults.ts` split.
 */

import { isSentinelVaultId } from "../sync/migration/sentinel-cleanup.ts";

/** The subset of the Upstash client the census reads with. */
export interface CensusClient {
  scan(
    cursor: number | string,
    opts?: { count?: number },
  ): Promise<[number | string, string[]]>;
  /** Byte length of a string value. Throws on a non-string key. */
  strlen(key: string): Promise<number>;
  zcard(key: string): Promise<number>;
}

export interface CensusGroup {
  kind: string;
  keys: number;
  /** Value bytes (STRLEN). Excludes Redis per-key overhead. */
  bytes: number;
  /** Member count, for the sorted-set kinds only. */
  members?: number;
}

export interface VaultSizeBucket {
  upToBytes: number;
  vaults: number;
}

export interface StorageCensus {
  /** Largest first. */
  groups: CensusGroup[];
  totalBytes: number;
  /** Real (non-sentinel) vaults only, smallest bucket first. */
  vaultSizeBuckets: VaultSizeBucket[];
}

const VAULT_PREFIX = "vault:";
const SORTED_SET_KEYS = new Set(["catalog:ranking"]);
const KNOWN_PREFIXES = [
  "vault-meta:",
  "catalog:feed:",
  "license:",
  "customer:",
  "seen-event:",
  "ratelimit:",
];

/** Name the kind of key without ever returning the key itself. */
export function classifyKey(key: string): string {
  if (key.startsWith(VAULT_PREFIX)) {
    return isSentinelVaultId(key.slice(VAULT_PREFIX.length))
      ? "vault (test sentinel)"
      : "vault";
  }
  if (SORTED_SET_KEYS.has(key)) return key;
  const known = KNOWN_PREFIXES.find((prefix) => key.startsWith(prefix));
  if (known === "customer:") return "license";
  if (known === "license:") return "license";
  if (known) return known.slice(0, -1);
  return `other (${key.split(":")[0]})`;
}

/** Smallest power of two at or above `bytes`. */
function bucketCeiling(bytes: number): number {
  let ceiling = 1;
  while (ceiling < bytes) ceiling *= 2;
  return ceiling;
}

/**
 * Walk the whole keyspace once and total it by kind.
 *
 * Costs one SCAN page per 100 keys plus one STRLEN or ZCARD per key.
 * A key whose type the census doesn't expect (a set, a hash) still
 * counts toward its group, with zero bytes.
 */
export async function takeStorageCensus(
  client: CensusClient,
): Promise<StorageCensus> {
  const groups = new Map<string, CensusGroup>();
  const vaultBuckets = new Map<number, number>();

  let cursor: number | string = 0;
  do {
    const [next, keys] = await client.scan(cursor, { count: 100 });
    for (const key of keys) {
      const kind = classifyKey(key);
      const group = groups.get(kind) ?? { kind, keys: 0, bytes: 0 };
      group.keys += 1;
      if (SORTED_SET_KEYS.has(key)) {
        group.members = (group.members ?? 0) + (await client.zcard(key));
      } else {
        const bytes = await client.strlen(key).catch(() => 0);
        group.bytes += bytes;
        if (kind === "vault") {
          const ceiling = bucketCeiling(bytes);
          vaultBuckets.set(ceiling, (vaultBuckets.get(ceiling) ?? 0) + 1);
        }
      }
      groups.set(kind, group);
    }
    cursor = next;
  } while (cursor !== 0 && cursor !== "0");

  const sorted = [...groups.values()].sort((a, b) => b.bytes - a.bytes);
  return {
    groups: sorted,
    totalBytes: sorted.reduce((sum, group) => sum + group.bytes, 0),
    vaultSizeBuckets: [...vaultBuckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([upToBytes, vaults]) => ({ upToBytes, vaults })),
  };
}
