import { ok, err } from "../../utils/result.ts";
import type { Result } from "../../utils/result.ts";
import { SYNC } from "../../utils/constants.ts";
import { exportAll, importAll } from "../storage/db.ts";
import {
  deriveVaultId,
  deriveVaultKey,
  encryptVault,
  decryptVault,
} from "./vault-crypto.ts";
import type { VaultData, EncryptedVault } from "./types.ts";

/** Pre-derived sync credentials, avoiding the need to store the raw passphrase. */
export interface SyncCredentials {
  vaultId: string;
  vaultKey: CryptoKey;
}

const MIN_BUCKET = 64 * 1024;

/**
 * Pad a JSON payload string to the nearest power-of-2 bucket size.
 * Prevents an observer from inferring subscription count from transfer size.
 * Adds a `_pad` field with random hex to reach the target length.
 */
export function padPayload(json: string): string {
  const targetSize = Math.min(
    nextPowerOf2(json.length, MIN_BUCKET),
    SYNC.MAX_VAULT_SIZE,
  );
  const overhead = ',"_pad":""'.length;
  const padLength = targetSize - json.length - overhead;
  if (padLength <= 0) return json;

  const pad = generateRandomHex(padLength);
  return json.slice(0, -1) + ',"_pad":"' + pad + '"}';
}

function generateRandomHex(length: number): string {
  const MAX_CHUNK = 65536;
  const parts: string[] = [];
  let remaining = Math.ceil(length / 2);
  while (remaining > 0) {
    const chunk = Math.min(remaining, MAX_CHUNK);
    const bytes = crypto.getRandomValues(new Uint8Array(chunk));
    for (const b of bytes) parts.push(b.toString(16).padStart(2, "0"));
    remaining -= chunk;
  }
  return parts.join("").slice(0, length);
}

function nextPowerOf2(size: number, min: number): number {
  let bucket = min;
  while (bucket < size) bucket *= 2;
  return bucket;
}

type SyncAuth = string | SyncCredentials;

async function resolveCredentials(
  auth: SyncAuth,
): Promise<Result<SyncCredentials>> {
  if (typeof auth !== "string") return ok(auth);
  const [vaultIdResult, vaultKeyResult] = await Promise.all([
    deriveVaultId(auth),
    deriveVaultKey(auth),
  ]);
  if (!vaultIdResult.ok) return vaultIdResult;
  if (!vaultKeyResult.ok) return vaultKeyResult;
  return ok({ vaultId: vaultIdResult.value, vaultKey: vaultKeyResult.value });
}

async function resolveVaultId(auth: SyncAuth): Promise<Result<string>> {
  if (typeof auth !== "string") return ok(auth.vaultId);
  return deriveVaultId(auth);
}

/**
 * Export all local data as a VaultData object.
 */
export async function exportVault(): Promise<Result<VaultData>> {
  const result = await exportAll();
  if (!result.ok) return result;
  return ok({
    version: SYNC.FORMAT_VERSION,
    exportedAt: Date.now(),
    feeds: result.value.feeds,
    articles: result.value.articles,
  });
}

/**
 * Replace all local data with the contents of a VaultData object.
 */
export async function importVault(vault: VaultData): Promise<Result<boolean>> {
  return importAll(vault.feeds, vault.articles);
}

/**
 * Encrypt local data and push it to the sync server.
 * Accepts a passphrase string or pre-derived SyncCredentials.
 * Returns the server-reported timestamp on success.
 */
export async function pushVault(auth: SyncAuth): Promise<Result<number>> {
  try {
    const [credsResult, vaultResult] = await Promise.all([
      resolveCredentials(auth),
      exportVault(),
    ]);
    if (!credsResult.ok) return credsResult;
    if (!vaultResult.ok) return vaultResult;
    const { vaultId, vaultKey } = credsResult.value;

    const encryptedResult = await encryptVault(vaultKey, vaultResult.value);
    if (!encryptedResult.ok) return encryptedResult;

    const body = padPayload(
      JSON.stringify({
        vaultId,
        vault: encryptedResult.value,
      }),
    );

    const response = await fetch("/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      return err(`Sync push failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    return ok(data.updatedAt ?? Date.now());
  } catch (e) {
    return err(`Sync push failed: ${(e as Error).message}`);
  }
}

/**
 * Delete the encrypted vault from the sync server.
 * Accepts a passphrase string or pre-derived SyncCredentials.
 */
export async function deleteVault(auth: SyncAuth): Promise<Result<boolean>> {
  try {
    const vaultIdResult = await resolveVaultId(auth);
    if (!vaultIdResult.ok) return vaultIdResult;

    const response = await fetch(`/api/sync?vaultId=${vaultIdResult.value}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const text = await response.text();
      return err(`Vault deletion failed (${response.status}): ${text}`);
    }

    return ok(true);
  } catch (e) {
    return err(`Vault deletion failed: ${(e as Error).message}`);
  }
}

/**
 * Pull encrypted vault from the sync server and decrypt it.
 * Accepts a passphrase string or pre-derived SyncCredentials.
 * Does NOT import into local DB — caller decides what to do with the data.
 */
export async function pullVault(auth: SyncAuth): Promise<Result<VaultData>> {
  try {
    const credsResult = await resolveCredentials(auth);
    if (!credsResult.ok) return credsResult;
    const { vaultId, vaultKey } = credsResult.value;

    const response = await fetch(`/api/sync?vaultId=${vaultId}`);

    if (!response.ok) {
      const text = await response.text();
      return err(`Sync pull failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    if (!data.vault) {
      return err("Server returned no vault data");
    }

    return decryptVault(vaultKey, data.vault as EncryptedVault);
  } catch (e) {
    return err(`Sync pull failed: ${(e as Error).message}`);
  }
}

/**
 * Check if a vault exists on the server.
 * Accepts a passphrase string or pre-derived SyncCredentials.
 * Uses HEAD request to avoid downloading the entire vault.
 */
export async function checkVaultExists(
  auth: SyncAuth,
): Promise<Result<boolean>> {
  try {
    const vaultIdResult = await resolveVaultId(auth);
    if (!vaultIdResult.ok) return vaultIdResult;

    const response = await fetch(`/api/sync?vaultId=${vaultIdResult.value}`, {
      method: "HEAD",
    });

    if (response.status === 404) {
      return ok(false);
    }

    if (!response.ok) {
      const text = await response.text();
      return err(`Check vault failed (${response.status}): ${text}`);
    }

    return ok(true);
  } catch (e) {
    return err(`Check vault failed: ${(e as Error).message}`);
  }
}

/**
 * Merge two vaults, deduplicating feeds by URL and articles by guid.
 * Local versions are preferred for duplicates.
 */
export function mergeVaults(
  localVault: VaultData,
  cloudVault: VaultData,
): Result<VaultData> {
  // Build map of local feeds by URL
  const localFeedsByUrl = new Map(localVault.feeds.map((f) => [f.url, f]));

  // Build feed ID remapping for cloud feeds that have a local equivalent
  const feedIdRemap = new Map<string, string>();

  // Merge feeds: all local + cloud feeds not in local
  const mergedFeeds = [...localVault.feeds];
  for (const cloudFeed of cloudVault.feeds) {
    const localFeed = localFeedsByUrl.get(cloudFeed.url);
    if (localFeed) {
      // Duplicate feed - map cloud feedId to local feedId
      feedIdRemap.set(cloudFeed.id, localFeed.id);
    } else {
      // New feed from cloud
      mergedFeeds.push(cloudFeed);
    }
  }

  // Build map of local articles by guid
  const localArticlesByGuid = new Map(
    localVault.articles.map((a) => [a.guid, a]),
  );

  // Merge articles: all local + cloud articles not in local (with feedId remapping)
  const mergedArticles = [...localVault.articles];
  for (const cloudArticle of cloudVault.articles) {
    if (!localArticlesByGuid.has(cloudArticle.guid)) {
      // Remap feedId if the feed was deduplicated
      const remappedFeedId =
        feedIdRemap.get(cloudArticle.feedId) ?? cloudArticle.feedId;
      mergedArticles.push({ ...cloudArticle, feedId: remappedFeedId });
    }
  }

  return ok({
    version: SYNC.FORMAT_VERSION,
    exportedAt: Date.now(),
    feeds: mergedFeeds,
    articles: mergedArticles,
  });
}
