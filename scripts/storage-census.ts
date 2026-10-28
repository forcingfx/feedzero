#!/usr/bin/env tsx
/**
 * Read-only census of the production Upstash keyspace: keys and bytes per
 * kind of key, plus real vault sizes as power-of-two buckets.
 *
 * Usage:
 *
 *   npx tsx scripts/storage-census.ts
 *
 * Required env vars (one pair):
 *
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *     OR KV_REST_API_URL + KV_REST_API_TOKEN  (Vercel-Marketplace aliases)
 *
 * Writes nothing. Prints no key that could identify a vault or a
 * customer, only kinds, counts and sizes. Costs one SCAN per 100 keys
 * plus one STRLEN or ZCARD per key.
 *
 * Library + tests: src/core/diagnostics/storage-census.ts and
 * tests/core/diagnostics/storage-census.test.ts.
 */

import {
  takeStorageCensus,
  type CensusClient,
  type StorageCensus,
} from "../src/core/diagnostics/storage-census.ts";

function resolveUpstashCreds(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Upstash credentials missing. Set UPSTASH_REDIS_REST_URL + " +
        "UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL + KV_REST_API_TOKEN).",
    );
  }
  return { url, token };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

function printCensus(census: StorageCensus): void {
  console.log("[census] kind                       keys        bytes");
  for (const group of census.groups) {
    const members =
      group.members === undefined ? "" : `  (${group.members} members)`;
    console.log(
      `[census] ${group.kind.padEnd(26)} ${String(group.keys).padStart(6)} ` +
        `${formatBytes(group.bytes).padStart(12)}${members}`,
    );
  }
  console.log(`[census] total value bytes: ${formatBytes(census.totalBytes)}`);
  console.log("");
  console.log("[census] real vaults by size");
  for (const bucket of census.vaultSizeBuckets) {
    console.log(
      `[census]   up to ${formatBytes(bucket.upToBytes).padStart(10)}: ${bucket.vaults}`,
    );
  }
}

async function main(): Promise<void> {
  const creds = resolveUpstashCreds();
  const { Redis } = await import("@upstash/redis");
  const upstash = new Redis({
    url: creds.url,
    token: creds.token,
    automaticDeserialization: false,
  });

  const client: CensusClient = {
    // Without a `type` option Upstash only returns the [cursor, string[]]
    // shape; narrowed here once, as in cleanup-sentinel-vaults.ts.
    scan: async (cursor, opts) => {
      const [next, keys] = await upstash.scan(cursor, opts ?? {});
      return [next, keys as string[]];
    },
    strlen: (key) => upstash.strlen(key),
    zcard: (key) => upstash.zcard(key),
  };

  console.log("[census] READ-ONLY: scanning the keyspace, writing nothing.");
  printCensus(await takeStorageCensus(client));
}

main().catch((e) => {
  console.error("[census] FATAL:", e instanceof Error ? e.message : String(e));
  process.exit(2);
});
