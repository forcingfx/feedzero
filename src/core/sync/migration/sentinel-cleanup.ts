/**
 * Delete test-sentinel vault entries from Upstash.
 *
 * A sentinel is a 64-hex-char vaultId where all 64 characters are the
 * same (e.g. "aaaa…", "0000…"). A real PBKDF2-derived vaultId is
 * uniformly random hex — the probability of all-same-char is 16^-63,
 * effectively zero. So any vault key matching this pattern is a test
 * artifact, safe to delete.
 *
 * Dry-run by default; execute is opt-in. Mirrors the safety posture of
 * the Blob → Upstash migration.
 *
 * Tested in tests/core/sync/migration/sentinel-cleanup.test.ts with
 * injected fake clients. CLI wrapper in
 * scripts/cleanup-sentinel-vaults.ts.
 */

const VAULT_KEY_PREFIX = "vault:";

/**
 * True iff the input is a 64-hex-char string of all-the-same character.
 * No real PBKDF2-derived vaultId satisfies this; only synthetic test
 * IDs do.
 */
export function isSentinelVaultId(vaultId: string): boolean {
  if (vaultId.length !== 64) return false;
  // First char must be lower-case hex (matches the rest of the project's
  // vaultId convention). Then assert every char is identical.
  if (!/^[0-9a-f]$/.test(vaultId[0]!)) return false;
  const first = vaultId[0];
  for (let i = 1; i < 64; i++) {
    if (vaultId[i] !== first) return false;
  }
  return true;
}

/**
 * Minimal subset of the Upstash Redis client this cleanup needs. SCAN
 * for enumeration, DEL for removal. Defined inline so tests inject a
 * fake without the real `@upstash/redis` SDK.
 */
export interface SentinelScanClient {
  scan(
    cursor: number | string,
    opts?: { match?: string; count?: number },
  ): Promise<[number | string, string[]]>;
  del(key: string): Promise<number>;
}

export interface SentinelCleanupOptions {
  /** When false (default), no deletes fire — just counts. */
  execute?: boolean;
  onProgress?: (event: { key: string; action: "found" | "deleted" }) => void;
}

export interface SentinelCleanupResult {
  /** Vault keys whose vaultId matches the sentinel pattern. */
  foundSentinels: string[];
  /** Successfully deleted. Always 0 in dry-run. */
  deleted: number;
}

export async function cleanupSentinelVaults(
  client: SentinelScanClient,
  options: SentinelCleanupOptions = {},
): Promise<SentinelCleanupResult> {
  const execute = options.execute ?? false;
  const onProgress = options.onProgress ?? (() => {});

  const result: SentinelCleanupResult = { foundSentinels: [], deleted: 0 };

  // Iterate all vault:* keys via SCAN cursor (pagination — see UpstashSyncAdapter).
  let cursor: number | string = 0;
  do {
    const [next, keys] = await client.scan(cursor, {
      match: `${VAULT_KEY_PREFIX}*`,
      count: 100,
    });
    for (const key of keys) {
      // Extract the vaultId suffix and check the sentinel pattern.
      if (!key.startsWith(VAULT_KEY_PREFIX)) continue;
      const vaultId = key.slice(VAULT_KEY_PREFIX.length);
      if (!isSentinelVaultId(vaultId)) continue;

      result.foundSentinels.push(key);
      onProgress({ key, action: "found" });

      if (execute) {
        const removed = await client.del(key);
        if (removed > 0) {
          result.deleted += 1;
          onProgress({ key, action: "deleted" });
        }
      }
    }
    cursor = next;
  } while (cursor !== 0 && cursor !== "0");

  return result;
}
