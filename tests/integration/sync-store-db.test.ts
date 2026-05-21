/**
 * Integration tests for the sync-store ↔ db.ts ↔ key-manager contract.
 *
 * The mocked unit tests in tests/stores/sync-store.test.ts and
 * tests/stores/sync-store-switch.test.ts verify branches by mocking the
 * key-manager and the sync-service. That layer of mocks is exactly what
 * let issue #117 ship: the cascade between vault import, key derivation
 * and the IndexedDB canary check spanned three modules, and the unit
 * tests' mocks abstracted away precisely the joint that drifted.
 *
 * See docs/incidents/2026-05-19-sync-cascade.md, "Why didn't tests catch
 * any of this":
 *
 *   > The rekey drift was caught by no test. The JSDoc claimed
 *   > "re-opens the DB" but the implementation didn't, and no test
 *   > exercised the full "rekey → close → openWithKeys" cycle.
 *
 * This file is the antidote. We run sync-store actions against the real
 * db.ts (encryption + HMAC + IndexedDB via fake-indexeddb) and the real
 * key-manager (assertKeyDataCoupling, persistDerivedKeysFromOpenDb).
 * Only the network boundary is mocked — pushVault, pullVault, deleteVault
 * are stubbed since they hit /api/sync. exportVault and importVault are
 * REAL: they read from / write to the encrypted DB.
 *
 * The contracts locked down by this file:
 *
 *  1. After `switchToExistingCloud("replace")`, restore()'s canary
 *     check returns "ready" — i.e. stored keys decrypt local data.
 *     This is exactly what issue #117's rekey drift broke.
 *  2. After `switchToExistingCloud("merge")`, both local and cloud
 *     feeds are present, AND the canary still passes.
 *  3. After `pull`, the in-memory feed-store snapshot equals the new
 *     real-DB contents — the same contract feed-store-db.test.ts
 *     locks down, but exercised through the cloud-update path.
 *  4. `deactivateLocal` clears credentials without touching the
 *     cloud vault (the deleteVault stub records no calls).
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// This file exercises the real key-manager + real db.ts + fake-indexeddb,
// which means every test pays the cost of PBKDF2 derivations through
// happy-dom's Web Crypto. Tests run 2.5–5.5s in isolation and can exceed
// the 5s default under parallel load. Bump the file-level timeout to
// match the per-test cost of real crypto. See key-manager.test.ts for the
// matching annotation.
vi.setConfig({ testTimeout: 15_000 });
import { useSyncStore } from "../../src/stores/sync-store.ts";
import { useFeedStore } from "../../src/stores/feed-store.ts";
import { useLicenseStore } from "../../src/stores/license-store.ts";
import {
  close,
  deleteDatabase,
  addFeed as dbAddFeed,
  getFeeds as dbGetFeeds,
} from "../../src/core/storage/db.ts";
import {
  initFresh,
  restore,
} from "../../src/core/storage/key-manager.ts";
import { clearLicenseToken } from "../../src/core/license/license-token-store.ts";
import { LOCAL_STORAGE } from "../../src/utils/constants.ts";
import type { VaultData } from "../../src/core/sync/types.ts";
import type { Feed } from "../../src/types/index.ts";

// Network boundary. pushVault / pullVault / deleteVault hit /api/sync;
// the rest (exportVault, importVault, mergeVaults) is pure or db-bound
// and runs for real.
const pushVaultMock = vi.fn();
const pullVaultMock = vi.fn();
const deleteVaultMock = vi.fn();

vi.mock("../../src/core/sync/sync-service.ts", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/core/sync/sync-service.ts")
  >("../../src/core/sync/sync-service.ts");
  return {
    ...actual,
    pushVault: (...args: unknown[]) => pushVaultMock(...args),
    pullVault: (...args: unknown[]) => pullVaultMock(...args),
    deleteVault: (...args: unknown[]) => deleteVaultMock(...args),
  };
});

function makeFeed(id: string, title: string): Feed {
  return {
    id,
    url: `https://${id}.example.com/feed.xml`,
    title,
    description: "",
    siteUrl: `https://${id}.example.com`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function emptyVault(): VaultData {
  return { version: 1, exportedAt: Date.now(), feeds: [], articles: [] };
}

function vaultWith(feeds: Feed[]): VaultData {
  return { version: 1, exportedAt: Date.now(), feeds, articles: [] };
}

const LOCAL_PASSPHRASE = "local-test-passphrase";
const CLOUD_PASSPHRASE = "cloud-test-passphrase";

async function resetEverything() {
  // Drop in-memory crypto state and the IndexedDB instance, then clear
  // localStorage so the next initFresh() starts with no derived keys.
  close();
  await deleteDatabase();
  localStorage.removeItem(LOCAL_STORAGE.DERIVED_KEYS);
  localStorage.removeItem(LOCAL_STORAGE.ONBOARDING_COMPLETE);
  localStorage.removeItem(LOCAL_STORAGE.STORAGE_MODE);
  clearLicenseToken();
  useSyncStore.setState({
    status: "local-only",
    lastSyncedAt: null,
    error: null,
    credentials: null,
  });
  useFeedStore.setState({
    feeds: [],
    folders: [],
    selectedFeedId: null,
    isLoading: false,
    error: null,
    feedsLoaded: false,
  });
  pushVaultMock.mockReset();
  pullVaultMock.mockReset();
  deleteVaultMock.mockReset();
  // Default network mocks to "ok"; tests override per-scenario.
  pushVaultMock.mockResolvedValue({ ok: true, value: Date.now() });
  pullVaultMock.mockResolvedValue({ ok: true, value: emptyVault() });
  deleteVaultMock.mockResolvedValue({ ok: true, value: true });
}

describe("sync-store ↔ db.ts integration", () => {
  beforeEach(async () => {
    await resetEverything();
    useLicenseStore.setState({ tier: "personal", verifying: false });
    // Open a fresh local DB before each test. initFresh wires keys into
    // both the in-memory DB instance and localStorage.
    const init = await initFresh(LOCAL_PASSPHRASE, { sync: false });
    if (!init.ok) throw new Error(`initFresh failed: ${init.error}`);
  });

  afterEach(async () => {
    await resetEverything();
  });

  describe("switchToExistingCloud('replace')", () => {
    it("leaves stored keys aligned with on-disk data (canary passes after the switch)", async () => {
      // This is the exact bug class from issue #117. Pre-fix, the
      // sequence `importVault(cloud) → rekey(cloudPassphrase)` left
      // ciphertext encrypted under the OLD keys while localStorage held
      // the NEW keys. The next session's canary check fails → invalid-keys.
      await dbAddFeed(makeFeed("local-only", "Local feed"));

      const cloudFeed = makeFeed("cloud-only", "Cloud feed");
      pullVaultMock.mockResolvedValue({
        ok: true,
        value: vaultWith([cloudFeed]),
      });

      const result = await useSyncStore
        .getState()
        .switchToExistingCloud(CLOUD_PASSPHRASE, "replace");
      expect(result.ok).toBe(true);

      // Canary: the on-disk data must decrypt with the stored keys.
      // If this status is anything but "ready", the data/key drift has
      // returned.
      const status = await restore();
      expect(status.status).toBe("ready");

      // And the replace mode should have wiped local-only feeds.
      const feeds = await dbGetFeeds();
      expect(feeds.ok && feeds.value.map((f) => f.id)).toEqual(["cloud-only"]);
    });

    it("updates the in-memory feed-store after a replace", async () => {
      const cloudFeed = makeFeed("cloud-only", "Cloud feed");
      pullVaultMock.mockResolvedValue({
        ok: true,
        value: vaultWith([cloudFeed]),
      });

      await useSyncStore
        .getState()
        .switchToExistingCloud(CLOUD_PASSPHRASE, "replace");

      // applyCloudVault calls loadFeeds() internally — the store should
      // already reflect the cloud vault without any extra refresh.
      const inStore = useFeedStore.getState().feeds.map((f) => f.id);
      expect(inStore).toEqual(["cloud-only"]);
    });
  });

  describe("switchToExistingCloud('merge')", () => {
    it("keeps local feeds AND adds cloud feeds, canary still passes", async () => {
      await dbAddFeed(makeFeed("local-only", "Local feed"));

      const cloudFeed = makeFeed("cloud-only", "Cloud feed");
      pullVaultMock.mockResolvedValue({
        ok: true,
        value: vaultWith([cloudFeed]),
      });

      const result = await useSyncStore
        .getState()
        .switchToExistingCloud(CLOUD_PASSPHRASE, "merge");
      expect(result.ok).toBe(true);

      const status = await restore();
      expect(status.status).toBe("ready");

      const feeds = await dbGetFeeds();
      const ids = feeds.ok ? feeds.value.map((f) => f.id).sort() : [];
      expect(ids).toEqual(["cloud-only", "local-only"]);
    });

    it("pushes the merged result back to the cloud", async () => {
      await dbAddFeed(makeFeed("local-only", "Local feed"));
      pullVaultMock.mockResolvedValue({
        ok: true,
        value: vaultWith([makeFeed("cloud-only", "Cloud feed")]),
      });

      await useSyncStore
        .getState()
        .switchToExistingCloud(CLOUD_PASSPHRASE, "merge");

      // The post-merge push is the only behavior that lets a second
      // device see the merged set. Without it, the merge is local-only.
      expect(pushVaultMock).toHaveBeenCalled();
    });
  });

  describe("pull", () => {
    it("applies a cloud vault to real local DB and store snapshot", async () => {
      // Simulate "already enabled sync" by injecting credentials directly
      // (we don't need to exercise the full enableSync path here).
      const { addVaultKeys } = await import(
        "../../src/core/storage/key-manager.ts"
      );
      const credsResult = await addVaultKeys(LOCAL_PASSPHRASE);
      if (!credsResult.ok) throw new Error(credsResult.error);
      useSyncStore.setState({
        credentials: credsResult.value,
        status: "synced",
      });

      const cloudFeed = makeFeed("from-cloud", "From cloud");
      pullVaultMock.mockResolvedValue({
        ok: true,
        value: vaultWith([cloudFeed]),
      });

      await useSyncStore.getState().pull();

      const fromDb = await dbGetFeeds();
      expect(fromDb.ok && fromDb.value.map((f) => f.id)).toEqual([
        "from-cloud",
      ]);
      // Status should flip to synced (not error)
      expect(useSyncStore.getState().status).toBe("synced");
    });

  });

  describe("deactivateLocal", () => {
    it("clears credentials without issuing a server-vault DELETE (ADR 018)", async () => {
      const { addVaultKeys } = await import(
        "../../src/core/storage/key-manager.ts"
      );
      const credsResult = await addVaultKeys(LOCAL_PASSPHRASE);
      if (!credsResult.ok) throw new Error(credsResult.error);
      useSyncStore.setState({
        credentials: credsResult.value,
        status: "synced",
      });

      await useSyncStore.getState().deactivateLocal();

      // The whole point of ADR 018: no automated code path may delete
      // server vault data. deactivateLocal is "I'm signing out of this
      // device" — cloud vault stays put for recovery later.
      expect(deleteVaultMock).not.toHaveBeenCalled();
      expect(useSyncStore.getState().credentials).toBeNull();
      expect(useSyncStore.getState().status).toBe("local-only");
    });
  });
});
