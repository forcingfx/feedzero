import { ok, err } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";
import { SYNC } from "../../../packages/core/src/utils/constants";
import { exportAll, importAll } from "../storage/db.ts";
import {
  deriveVaultId,
  deriveVaultKey,
  encryptVault,
  decryptVault,
  readKdfSpec,
  LEGACY_KDF_SPEC,
  DEFAULT_NEW_VAULT_KDF,
} from "./vault-crypto.ts";
import type { VaultData, EncryptedVault, KdfSpec } from "./types.ts";
import { syncFetch } from "./sync-fetch.ts";

/**
 * Pre-derived sync credentials, avoiding the need to store the raw
 * passphrase. `kdfSpec` records which KDF produced `vaultKey` so
 * `pushVault` can stamp the matching field on the envelope — a
 * recovering device reads that field to re-derive the right key.
 */
export interface SyncCredentials {
  vaultId: string;
  vaultKey: CryptoKey;
  kdfSpec: KdfSpec;
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

/**
 * Resolve a passphrase-or-credentials union to full credentials.
 *
 * The string-auth path derives the legacy PBKDF2 pair (vault ID +
 * vault key). It is intentionally NOT spec-aware — calling this with
 * a passphrase against a vault encrypted with Argon2id would decrypt
 * silently against the wrong key and fail with a confusing error.
 * Production recovery flows MUST use `recoverVault` (which reads the
 * envelope's KDF stamp); this path remains for test convenience
 * against vaults written by the same string-auth path.
 */
async function resolveCredentials(
  auth: SyncAuth,
): Promise<Result<SyncCredentials>> {
  if (typeof auth !== "string") return ok(auth);
  const [vaultIdResult, vaultKeyResult] = await Promise.all([
    deriveVaultId(auth),
    deriveVaultKey(auth, { extractable: true, kdfSpec: LEGACY_KDF_SPEC }),
  ]);
  if (!vaultIdResult.ok) return vaultIdResult;
  if (!vaultKeyResult.ok) return vaultKeyResult;
  return ok({
    vaultId: vaultIdResult.value,
    vaultKey: vaultKeyResult.value,
    kdfSpec: LEGACY_KDF_SPEC,
  });
}

async function resolveVaultId(auth: SyncAuth): Promise<Result<string>> {
  if (typeof auth !== "string") return ok(auth.vaultId);
  return deriveVaultId(auth);
}

/**
 * Export all local data as a VaultData object.
 * Strips article body fields (content/summary) — they're large and the
 * canonical source on every device is the publisher feed plus on-demand
 * extraction (or the persisted `extractedContent` for starred articles,
 * which DOES ride along).
 */
export async function exportVault(): Promise<Result<VaultData>> {
  const result = await exportAll();
  if (!result.ok) return result;
  return ok({
    version: SYNC.FORMAT_VERSION,
    exportedAt: Date.now(),
    feeds: result.value.feeds,
    articles: result.value.articles.map((a) => ({
      ...a,
      content: "",
      summary: "",
    })),
    folders: result.value.folders,
    smartFilters: result.value.smartFilters,
    preferences: result.value.preferences ?? undefined,
    preferencesUpdatedAt: result.value.preferencesUpdatedAt ?? undefined,
    briefings: result.value.briefings,
    secrets:
      result.value.anthropicKey !== null
        ? { anthropicKey: result.value.anthropicKey }
        : undefined,
  });
}

/**
 * Replace all local data with the contents of a VaultData object.
 * Folders + smartFilters are forwarded verbatim, including the
 * `undefined`-vs-`[]` distinction — see importAll for the back-compat
 * contract.
 */
export async function importVault(vault: VaultData): Promise<Result<boolean>> {
  return importAll({
    feeds: vault.feeds,
    articles: vault.articles,
    folders: vault.folders,
    smartFilters: vault.smartFilters,
    preferences: vault.preferences,
    preferencesUpdatedAt: vault.preferencesUpdatedAt,
    briefings: vault.briefings,
    anthropicKey: vault.secrets?.anthropicKey,
  });
}

/**
 * Encrypt local data and push it to the sync server.
 * Accepts a passphrase string or pre-derived SyncCredentials.
 * Returns the server-reported timestamp + the post-write ETag (when
 * the server emits one) so the caller can prime its conditional-pull
 * cache without an extra round-trip.
 */
export interface PushOutcome {
  updatedAt: number;
  etag: string | null;
}

export async function pushVault(
  auth: SyncAuth,
): Promise<Result<PushOutcome>> {
  try {
    const [credsResult, vaultResult] = await Promise.all([
      resolveCredentials(auth),
      exportVault(),
    ]);
    if (!credsResult.ok) return credsResult;
    if (!vaultResult.ok) return vaultResult;
    const { vaultId, vaultKey } = credsResult.value;

    const encryptedResult = await encryptVault(
      vaultKey,
      vaultResult.value,
      credsResult.value.kdfSpec,
    );
    if (!encryptedResult.ok) return encryptedResult;

    const body = padPayload(
      JSON.stringify({
        vaultId,
        vault: encryptedResult.value,
      }),
    );

    const response = await syncFetch("/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      return err(`Sync push failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    return ok({
      updatedAt: data.updatedAt ?? Date.now(),
      etag: response.headers?.get?.("ETag") ?? null,
    });
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

    const response = await syncFetch(`/api/sync?vaultId=${vaultIdResult.value}`, {
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
  const result = await pullVaultIfChanged(auth);
  if (!result.ok) return result;
  // Unconditional pull never returns notModified because no
  // If-None-Match is sent — but the type union forces a guard.
  if (result.value.notModified) {
    return err("Unexpected 304 on unconditional pull");
  }
  return ok(result.value.vault);
}

/**
 * Successful conditional-pull outcomes.
 *  - notModified: true → server replied 304; the caller's cached vault
 *    is still current. `etag` echoes the validator so the caller can
 *    refresh its cache marker.
 *  - notModified: false → fresh vault decrypted; `etag` is the value
 *    the caller should send back as If-None-Match on the next pull.
 */
export type PullVaultOutcome =
  | { notModified: true; etag: string | null }
  | { notModified: false; vault: VaultData; etag: string | null };

/**
 * Conditional pull. When `ifNoneMatch` matches the server-side ETag,
 * the server replies 304 and we save the full vault download (plus the
 * decryption work). The sync-store calls this with the last ETag it
 * saw; first-ever pulls pass `undefined` and always get a fresh vault.
 */
export async function pullVaultIfChanged(
  auth: SyncAuth,
  ifNoneMatch?: string,
): Promise<Result<PullVaultOutcome>> {
  try {
    const credsResult = await resolveCredentials(auth);
    if (!credsResult.ok) return credsResult;
    const { vaultId, vaultKey } = credsResult.value;

    const headers: Record<string, string> = {};
    if (ifNoneMatch) headers["If-None-Match"] = ifNoneMatch;

    const response = await syncFetch(`/api/sync?vaultId=${vaultId}`, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });

    if (response.status === 304) {
      // Nothing changed — caller skips the import; vault stays as-is.
      return ok({
        notModified: true,
        etag: response.headers?.get?.("ETag") ?? null,
      });
    }

    if (!response.ok) {
      if (response.status === 404) {
        return err(
          "No cloud vault was found for this passphrase. " +
            "If this is your first device, push from there first. " +
            "If you're restoring on a new device, double-check the passphrase — " +
            "every word matters and order matters.",
        );
      }
      const text = await response.text();
      return err(`Sync pull failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    if (!data.vault) {
      return err("Server returned no vault data");
    }

    const decryptResult = await decryptVault(vaultKey, data.vault as EncryptedVault);
    if (!decryptResult.ok) return decryptResult;

    return ok({
      notModified: false,
      vault: decryptResult.value,
      etag: response.headers?.get?.("ETag") ?? null,
    });
  } catch (e) {
    return err(`Sync pull failed: ${(e as Error).message}`);
  }
}

/**
 * Recover a vault on a new device from a passphrase alone.
 *
 * Derives the vault ID via PBKDF2 (the routing identifier — unchanged
 * across KDF migrations), pulls the encrypted envelope, reads its
 * stamped `kdf` field, derives the matching vault key, and decrypts.
 *
 * Returns full credentials whose `kdfSpec` matches what the cloud
 * envelope was encrypted with — so subsequent pushes from this
 * device stamp the same spec, preserving the cloud encoding. Use
 * this from any flow that holds only the passphrase (recovery-step,
 * switchToExistingCloud). The plain `pullVault(passphrase)` path
 * cannot decrypt Argon2id envelopes — it assumes legacy KDF.
 */
export async function recoverVault(
  passphrase: string,
): Promise<Result<{ vault: VaultData; credentials: SyncCredentials }>> {
  const vaultIdResult = await deriveVaultId(passphrase);
  if (!vaultIdResult.ok) return vaultIdResult;
  const vaultId = vaultIdResult.value;

  try {
    const response = await syncFetch(`/api/sync?vaultId=${vaultId}`);

    if (!response.ok) {
      if (response.status === 404) {
        return err(
          "No cloud vault was found for this passphrase. " +
            "If this is your first device, push from there first. " +
            "If you're restoring on a new device, double-check the passphrase — " +
            "every word matters and order matters.",
        );
      }
      const text = await response.text();
      return err(`Sync pull failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    if (!data.vault) return err("Server returned no vault data");

    const envelope = data.vault as EncryptedVault;
    const kdfSpec = readKdfSpec(envelope);

    const vaultKeyResult = await deriveVaultKey(passphrase, {
      extractable: true,
      kdfSpec,
    });
    if (!vaultKeyResult.ok) return vaultKeyResult;
    const vaultKey = vaultKeyResult.value;

    const decryptResult = await decryptVault(vaultKey, envelope);
    if (!decryptResult.ok) return decryptResult;

    return ok({
      vault: decryptResult.value,
      credentials: { vaultId, vaultKey, kdfSpec },
    });
  } catch (e) {
    return err(`Vault recovery failed: ${(e as Error).message}`);
  }
}

/**
 * Whether two KDF specs are equivalent (same kind and same params).
 * Used by `upgradeVaultKdf` to short-circuit no-op upgrades.
 */
function kdfSpecsMatch(a: KdfSpec, b: KdfSpec): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "pbkdf2-600k") return true;
  if (b.kind !== "argon2id") return false;
  return (
    a.memoryKib === b.memoryKib &&
    a.iterations === b.iterations &&
    a.parallelism === b.parallelism
  );
}

/**
 * Re-encrypt a sync vault with a stronger KDF and push it back to the
 * same vault ID. Used by the recovery flow to silently upgrade legacy
 * PBKDF2 vaults to Argon2id the first time the user types their
 * passphrase on a new device — the "auto-upgrade on next passphrase
 * entry" migration path.
 *
 * The vault ID derivation is intentionally KDF-invariant (always
 * PBKDF2), so the upgrade is a single PUT to the same vault ID, no
 * migration of identifiers. Returns the new credentials whose
 * `vaultKey` corresponds to the new spec — callers MUST persist
 * these via `updateStoredVaultKey` before they can be used again
 * on this device.
 *
 * Caller-friendly behavior: if `current.kdfSpec` already matches
 * `targetSpec`, the function returns `current` unchanged without
 * any network call. If the push fails, the function returns an
 * error and the caller can fall back to the legacy credentials —
 * the cloud envelope is unchanged in that case, so a retry on the
 * next session can complete the upgrade.
 */
export async function upgradeVaultKdf(
  passphrase: string,
  current: SyncCredentials,
  vault: VaultData,
  targetSpec: KdfSpec = DEFAULT_NEW_VAULT_KDF,
): Promise<Result<SyncCredentials>> {
  if (kdfSpecsMatch(current.kdfSpec, targetSpec)) {
    return ok(current);
  }

  const newKeyResult = await deriveVaultKey(passphrase, {
    extractable: true,
    kdfSpec: targetSpec,
  });
  if (!newKeyResult.ok) return newKeyResult;

  const encryptedResult = await encryptVault(
    newKeyResult.value,
    vault,
    targetSpec,
  );
  if (!encryptedResult.ok) return encryptedResult;

  const body = padPayload(
    JSON.stringify({
      vaultId: current.vaultId,
      vault: encryptedResult.value,
    }),
  );

  const response = await syncFetch("/api/sync", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    return err(`KDF upgrade push failed (${response.status}): ${text}`);
  }

  return ok({
    vaultId: current.vaultId,
    vaultKey: newKeyResult.value,
    kdfSpec: targetSpec,
  });
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

    const response = await syncFetch(`/api/sync?vaultId=${vaultIdResult.value}`, {
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

  // Folders + smartFilters + briefings: dedup by id, local wins on
  // collision. Mirrors the feeds-by-URL rule. A pre-v4 cloud vault
  // omits briefings, in which case the local set survives untouched.
  const mergedFolders = mergeByIdLocalWins(
    localVault.folders,
    cloudVault.folders,
  );
  const mergedSmartFilters = mergeByIdLocalWins(
    localVault.smartFilters,
    cloudVault.smartFilters,
  );
  const mergedBriefings = mergeByIdLocalWins(
    localVault.briefings,
    cloudVault.briefings,
  );

  // Preferences are a scalar record, not an id-keyed collection — pick the
  // side written most recently (ties favor local). Whichever side is taken,
  // its timestamp rides along so the result reflects the chosen state.
  const { preferences, preferencesUpdatedAt } = mergePreferencesLatestWins(
    localVault,
    cloudVault,
  );

  // Secrets: take whichever side has a value, local wins on collision.
  // A user actively clearing their key locally re-syncs that empty
  // state; a passive mismatch picks up the other side's value so the
  // user doesn't have to re-paste their key after a fresh install.
  const mergedSecrets = mergeSecretsLocalWins(
    localVault.secrets,
    cloudVault.secrets,
  );

  return ok({
    version: SYNC.FORMAT_VERSION,
    exportedAt: Date.now(),
    feeds: mergedFeeds,
    articles: mergedArticles,
    folders: mergedFolders,
    smartFilters: mergedSmartFilters,
    preferences,
    preferencesUpdatedAt,
    briefings: mergedBriefings,
    secrets: mergedSecrets,
  });
}

/**
 * Last-write-wins selection for the scalar preferences record. The newer
 * `preferencesUpdatedAt` wins; a tie favors local (matching the id-merge
 * helper's local-bias). When only one side defines preferences, that side
 * is taken regardless of its timestamp; when neither does, the result is
 * undefined so the back-compat "no opinion" contract holds.
 */
function mergePreferencesLatestWins(
  local: VaultData,
  cloud: VaultData,
): Pick<VaultData, "preferences" | "preferencesUpdatedAt"> {
  if (local.preferences === undefined && cloud.preferences === undefined) {
    return { preferences: undefined, preferencesUpdatedAt: undefined };
  }
  if (local.preferences === undefined) {
    return {
      preferences: cloud.preferences,
      preferencesUpdatedAt: cloud.preferencesUpdatedAt,
    };
  }
  if (cloud.preferences === undefined) {
    return {
      preferences: local.preferences,
      preferencesUpdatedAt: local.preferencesUpdatedAt,
    };
  }
  const useCloud =
    (cloud.preferencesUpdatedAt ?? 0) > (local.preferencesUpdatedAt ?? 0);
  return useCloud
    ? {
        preferences: cloud.preferences,
        preferencesUpdatedAt: cloud.preferencesUpdatedAt,
      }
    : {
        preferences: local.preferences,
        preferencesUpdatedAt: local.preferencesUpdatedAt,
      };
}

/**
 * Merge two arrays of records keyed by `id`. Local entries are
 * preserved; cloud-only entries are appended. Returns `undefined` only
 * when both inputs are `undefined`, so the v1-cloud case doesn't lose
 * the local set.
 */
/**
 * Merge secrets across vaults: local non-empty values win, otherwise
 * take the cloud value. An undefined `secrets` block on either side is
 * "no opinion"; both undefined leaves the result undefined so the
 * back-compat "no opinion" contract holds for old clients.
 */
function mergeSecretsLocalWins(
  local: VaultData["secrets"],
  cloud: VaultData["secrets"],
): VaultData["secrets"] {
  if (local === undefined && cloud === undefined) return undefined;
  const anthropicKey = local?.anthropicKey || cloud?.anthropicKey;
  if (!anthropicKey) return {};
  return { anthropicKey };
}

function mergeByIdLocalWins<T extends { id: string }>(
  local: T[] | undefined,
  cloud: T[] | undefined,
): T[] | undefined {
  if (local === undefined && cloud === undefined) return undefined;
  const merged = [...(local ?? [])];
  const seen = new Set(merged.map((x) => x.id));
  for (const item of cloud ?? []) {
    if (!seen.has(item.id)) {
      merged.push(item);
      seen.add(item.id);
    }
  }
  return merged;
}
