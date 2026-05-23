// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  deriveVaultId,
  deriveVaultKey,
  encryptVault,
  decryptVault,
} from "../../src/core/sync/vault-crypto.ts";
import { DEFAULT_PREFERENCES } from "@feedzero/core/types";
import type { VaultData } from "../../src/core/sync/types.ts";

/**
 * Smoke test: a v3 vault carrying `preferences` + `preferencesUpdatedAt`
 * encrypts client-side, survives the live /api/sync server byte-for-byte,
 * and decrypts back with preferences intact.
 *
 * Why this matters beyond the opaque-blob roundtrip in sync.test.ts: that
 * test proves the server stores whatever bytes it's given. This proves the
 * NEW v3 fields make the full client crypto + transport trip without being
 * dropped or mangled — the system-level check the unit suite (in-process,
 * no real network) can't make.
 *
 * Skipped by default. Run with `SMOKE_TESTS=1 npx vitest run tests/smoke/`.
 * Side effects: writes one vault under a unique sentinel passphrase, then
 * deletes it in a finally block.
 */

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

describe.skipIf(SKIP)("production /api/sync preferences roundtrip (live)", () => {
  it("PUT → GET a v3 vault preserves preferences after decryption", async () => {
    const passphrase = `smoke-prefs-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const idResult = await deriveVaultId(passphrase);
    const keyResult = await deriveVaultKey(passphrase);
    if (!idResult.ok) throw new Error(`deriveVaultId: ${idResult.error}`);
    if (!keyResult.ok) throw new Error(`deriveVaultKey: ${keyResult.error}`);
    const vaultId = idResult.value;

    const preferencesUpdatedAt = Date.now();
    const vault: VaultData = {
      version: 3,
      exportedAt: Date.now(),
      feeds: [],
      articles: [],
      preferences: {
        ...DEFAULT_PREFERENCES,
        feedSortMode: "custom",
        feedCustomOrder: ["feed-b", "feed-a"],
        articleSortMode: "oldest",
        groupArticleFloods: false,
      },
      preferencesUpdatedAt,
    };

    const encrypted = await encryptVault(keyResult.value, vault);
    if (!encrypted.ok) throw new Error(`encryptVault: ${encrypted.error}`);

    try {
      const putRes = await fetch(`${BASE_URL}/api/sync`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId, vault: encrypted.value }),
      });
      expect(putRes.status).toBe(200);

      const getRes = await fetch(`${BASE_URL}/api/sync?vaultId=${vaultId}`);
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.ok).toBe(true);

      const decrypted = await decryptVault(keyResult.value, getBody.vault);
      if (!decrypted.ok) throw new Error(`decryptVault: ${decrypted.error}`);
      expect(decrypted.value.preferences).toEqual(vault.preferences);
      expect(decrypted.value.preferencesUpdatedAt).toBe(preferencesUpdatedAt);
    } finally {
      await fetch(`${BASE_URL}/api/sync?vaultId=${vaultId}`, {
        method: "DELETE",
      });
    }
  }, 20_000);
});
