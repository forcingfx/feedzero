#!/usr/bin/env tsx
/**
 * CLI wrapper for the test-sentinel vault cleanup.
 *
 * Usage:
 *
 *   # Dry-run (default — list sentinel keys, delete nothing)
 *   npx tsx scripts/cleanup-sentinel-vaults.ts
 *
 *   # Execute (delete sentinel keys from Upstash)
 *   npx tsx scripts/cleanup-sentinel-vaults.ts --execute
 *
 * Required env vars (one pair):
 *
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *     OR KV_REST_API_URL + KV_REST_API_TOKEN  (Vercel-Marketplace aliases)
 *
 * A sentinel is any `vault:<64-hex>` where all 64 chars are the same
 * (e.g. `vault:aaaa…`). Real PBKDF2-derived vaultIds are uniformly
 * random hex — same-char chance is 16^-63 ≈ 0 — so any match is a
 * test artifact, safe to delete.
 *
 * The cleanup module + tests are at
 * src/core/sync/migration/sentinel-cleanup.ts and
 * tests/core/sync/migration/sentinel-cleanup.test.ts.
 */

import {
  cleanupSentinelVaults,
  type SentinelScanClient,
} from "../src/core/sync/migration/sentinel-cleanup.ts";

function parseArgs(): { execute: boolean } {
  return { execute: process.argv.slice(2).includes("--execute") };
}

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

async function main(): Promise<void> {
  const { execute } = parseArgs();
  const creds = resolveUpstashCreds();

  const { Redis } = await import("@upstash/redis");
  const upstash = new Redis({
    url: creds.url,
    token: creds.token,
    // Matches the live UpstashSyncAdapter posture (ADR 008).
    automaticDeserialization: false,
  });

  const client: SentinelScanClient = {
    scan: (cursor, opts) => upstash.scan(cursor, opts),
    del: (key) => upstash.del(key),
  };

  console.log(
    execute
      ? "[cleanup] EXECUTE — deletes any vault:<64-same-char> keys from Upstash."
      : "[cleanup] DRY-RUN — lists sentinel keys, deletes nothing. Pass --execute to apply.",
  );

  const start = Date.now();
  const result = await cleanupSentinelVaults(client, {
    execute,
    onProgress: (event) => {
      console.log(
        `[cleanup] ${event.action.toUpperCase().padEnd(8)} ${event.key.slice(0, 20)}…`,
      );
    },
  });
  const elapsedMs = Date.now() - start;

  console.log("");
  console.log("[cleanup] === Summary ===");
  console.log(`[cleanup]   foundSentinels: ${result.foundSentinels.length}`);
  console.log(`[cleanup]   deleted:        ${result.deleted}`);
  console.log(`[cleanup]   elapsed:        ${elapsedMs}ms`);
  if (!execute && result.foundSentinels.length > 0) {
    console.log("");
    console.log(
      `[cleanup] Found ${result.foundSentinels.length} sentinel(s). Re-run with --execute to delete.`,
    );
  }
}

main().catch((e) => {
  console.error("[cleanup] FATAL:", e instanceof Error ? e.message : String(e));
  process.exit(2);
});
