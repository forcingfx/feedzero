#!/usr/bin/env tsx
/**
 * CLI wrapper for the Blob → Upstash vault migration.
 *
 * Usage:
 *
 *   # Dry-run (default — reports what would migrate, writes nothing)
 *   npx tsx scripts/migrate-blob-to-upstash.ts
 *
 *   # Execute (writes to Upstash; leaves Blob originals in place)
 *   npx tsx scripts/migrate-blob-to-upstash.ts --execute
 *
 *   # Execute + delete Blob originals after successful Upstash write
 *   npx tsx scripts/migrate-blob-to-upstash.ts --execute --delete-blob
 *
 * Required env vars:
 *
 *   BLOB_READ_WRITE_TOKEN          Vercel Blob token (production project value)
 *   UPSTASH_REDIS_REST_URL         Upstash REST URL
 *     OR KV_REST_API_URL           (Vercel-Marketplace-injected alias)
 *   UPSTASH_REDIS_REST_TOKEN       Upstash REST token
 *     OR KV_REST_API_TOKEN
 *
 * Pull production env locally before running:
 *
 *   vercel link                            # if not already linked
 *   vercel env pull .env.migration --environment=production
 *   set -a && source .env.migration && set +a
 *   npx tsx scripts/migrate-blob-to-upstash.ts
 *
 * The migration module itself is in src/core/sync/migration/blob-to-upstash.ts
 * with unit tests; this file is just the CLI wiring (real Vercel Blob + Upstash
 * clients, arg parsing, progress logging).
 */

import {
  migrateBlobVaultsToUpstash,
  type BlobListClient,
  type UpstashSetClient,
} from "../src/core/sync/migration/blob-to-upstash.ts";

function parseArgs(): { execute: boolean; deleteBlob: boolean } {
  const args = process.argv.slice(2);
  return {
    execute: args.includes("--execute"),
    deleteBlob: args.includes("--delete-blob"),
  };
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
  const { execute, deleteBlob } = parseArgs();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN missing. This is required to list and read " +
        "the legacy Vercel Blob vault store. Pull from production env via " +
        "`vercel env pull` first.",
    );
  }
  const upstashCreds = resolveUpstashCreds();

  // Lazy imports so the SDKs aren't required for unit tests.
  const blobModule = await import("@vercel/blob");
  const { Redis } = await import("@upstash/redis");

  const blobClient: BlobListClient = {
    async list(opts) {
      const result = await blobModule.list({
        prefix: opts?.prefix,
        limit: opts?.limit,
        cursor: opts?.cursor,
      });
      return {
        blobs: result.blobs.map((b) => ({
          pathname: b.pathname,
          url: b.url,
          size: b.size,
        })),
        hasMore: result.hasMore,
        cursor: result.cursor,
      };
    },
    async fetchUrl(url) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching ${url}`);
      }
      return await response.text();
    },
    async del(pathname) {
      await blobModule.del(pathname);
    },
  };

  const upstash = new Redis({
    url: upstashCreds.url,
    token: upstashCreds.token,
    // Vaults are stored as JSON STRINGS, not objects. Auto-deserialization
    // is OFF on the live sync adapter for the same reason — see ADR 008.
    automaticDeserialization: false,
  });

  const upstashClient: UpstashSetClient = {
    async set(key, value) {
      return upstash.set(key, value);
    },
  };

  // Top-of-run banner so the operator knows what mode is active. Dry-run
  // mode is the cheap-to-trust default; execute is loud.
  if (!execute) {
    console.log("[migrate] DRY-RUN — no writes. Pass --execute to actually migrate.");
  } else if (deleteBlob) {
    console.log("[migrate] EXECUTE + DELETE-BLOB — writes to Upstash, deletes Blob originals after each success.");
  } else {
    console.log("[migrate] EXECUTE — writes to Upstash, leaves Blob originals in place.");
  }

  const start = Date.now();
  const result = await migrateBlobVaultsToUpstash(blobClient, upstashClient, {
    execute,
    deleteBlob,
    onProgress: (event) => {
      const label = event.action.toUpperCase().padEnd(10);
      const msg = event.error ? ` — ${event.error}` : "";
      console.log(`[migrate] ${label} vault:${event.vaultId.slice(0, 12)}…${msg}`);
    },
  });
  const elapsedMs = Date.now() - start;

  console.log("");
  console.log("[migrate] === Summary ===");
  console.log(`[migrate]   found:    ${result.found}`);
  console.log(`[migrate]   skipped:  ${result.skipped} (non-vault files under vaults/)`);
  console.log(`[migrate]   migrated: ${result.migrated}`);
  console.log(`[migrate]   deleted:  ${result.deleted}`);
  console.log(`[migrate]   failed:   ${result.failed.length}`);
  if (result.failed.length > 0) {
    for (const failure of result.failed) {
      console.log(`[migrate]     - vault:${failure.vaultId.slice(0, 12)}… — ${failure.error}`);
    }
  }
  console.log(`[migrate]   elapsed:  ${elapsedMs}ms`);
  if (!execute && result.found > 0) {
    console.log("");
    console.log(`[migrate] Found ${result.found} vault(s) to migrate. Re-run with --execute to apply.`);
  }

  // Exit non-zero on any per-vault failure so a CI runner notices.
  process.exit(result.failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[migrate] FATAL:", e instanceof Error ? e.message : String(e));
  process.exit(2);
});
