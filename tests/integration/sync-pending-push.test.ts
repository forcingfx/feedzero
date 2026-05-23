/**
 * Integration test for the "unpushed local change survives a pull" contract.
 *
 * Sync writes are debounced (5s) + jittered (0–30s) in scheduleSyncPush.
 * The debounce timer lives only in memory, so a tab reload — or any other
 * trigger that fires pull() before the timer elapses (e.g. the periodic
 * auto-refresh) — drops the pending push. The next pull() then runs
 * importVault, which REPLACES all local data with the cloud copy. A feed
 * the user just renamed but whose push never fired is silently reverted.
 *
 * This test models a shared cloud (push uploads the current local DB,
 * pull downloads whatever was last pushed) so the temporal coupling is
 * exercised end-to-end against the real db.ts + importVault/exportVault.
 * Only the network transport (pushVault/pullVault) is mocked.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ok } from "@feedzero/core/utils/result";
import type { VaultData } from "../../src/core/sync/types.ts";
import type { Feed } from "@feedzero/core/types";

const pushVaultMock = vi.fn();
const pullVaultMock = vi.fn();

vi.mock("../../src/core/sync/sync-service.ts", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/core/sync/sync-service.ts")
  >("../../src/core/sync/sync-service.ts");
  // pullVaultIfChanged delegates to the same pullVaultMock — wraps the
  // returned VaultData in the conditional-pull envelope so the production
  // sync-store path sees what it expects.
  const pullCompat = async (...args: unknown[]) => {
    const r = await pullVaultMock(...args);
    if (!r.ok) return r;
    return {
      ok: true as const,
      value: { notModified: false, vault: r.value, etag: null },
    };
  };
  return {
    ...actual,
    pushVault: (...args: unknown[]) => pushVaultMock(...args),
    pullVault: (...args: unknown[]) => pullVaultMock(...args),
    pullVaultIfChanged: pullCompat,
  };
});

import { useSyncStore } from "../../src/stores/sync-store.ts";
import { useFeedStore } from "../../src/stores/feed-store.ts";
import { useLicenseStore } from "../../src/stores/license-store.ts";
import {
  open,
  close,
  deleteDatabase,
  addFeed as dbAddFeed,
  getFeeds as dbGetFeeds,
} from "../../src/core/storage/db.ts";
import { LOCAL_STORAGE } from "@feedzero/core/utils/constants";

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

describe("sync: unpushed local rename survives a pull", () => {
  beforeEach(async () => {
    useLicenseStore.setState({ tier: "personal", verifying: false });
    await open("test-passphrase");
    useFeedStore.setState({ feeds: [], feedsLoaded: false });
    useSyncStore.setState({
      credentials: { vaultId: "vault", vaultKey: {} as CryptoKey },
      status: "synced",
    });

    // Shared cloud: push uploads the current local DB; pull returns it.
    let cloud: VaultData = {
      version: 1,
      exportedAt: Date.now(),
      feeds: [makeFeed("a", "Original")],
      articles: [],
    };
    pushVaultMock.mockImplementation(async () => {
      const feeds = await dbGetFeeds();
      cloud = {
        version: 1,
        exportedAt: Date.now(),
        feeds: feeds.ok ? feeds.value : [],
        articles: [],
      };
      return ok(Date.now());
    });
    pullVaultMock.mockImplementation(async () => ok(cloud));
  });

  afterEach(async () => {
    // Neutralize the leaked debounce timer from scheduleSyncPush: with no
    // credentials, the eventual push() returns early.
    useSyncStore.setState({ credentials: null });
    close();
    await deleteDatabase();
    localStorage.removeItem(LOCAL_STORAGE.SYNC_PENDING_PUSH);
    vi.clearAllMocks();
  });

  it("does not revert a rename whose debounced push never fired", async () => {
    await dbAddFeed(makeFeed("a", "Original"));
    await useFeedStore.getState().loadFeeds();

    // User renames the feed. This persists to IndexedDB and schedules a
    // debounced push — which we never let elapse (simulating a reload).
    await useFeedStore.getState().renameFeed("a", "Renamed");

    const afterRename = await dbGetFeeds();
    expect(afterRename.ok && afterRename.value[0].title).toBe("Renamed");

    // App reload / periodic refresh runs pull() before the push fired.
    await useSyncStore.getState().pull();

    const afterPull = await dbGetFeeds();
    expect(afterPull.ok && afterPull.value[0].title).toBe("Renamed");
  });

  it("still adopts cloud changes when local has no pending push", async () => {
    await dbAddFeed(makeFeed("a", "Original"));
    await useFeedStore.getState().loadFeeds();

    // No local mutation → no pending push. The cloud has a different
    // feed (a change made on another device). A pull must adopt it.
    pullVaultMock.mockImplementation(async () =>
      ok({
        version: 1,
        exportedAt: Date.now(),
        feeds: [makeFeed("b", "From Other Device")],
        articles: [],
      }),
    );

    await useSyncStore.getState().pull();

    const afterPull = await dbGetFeeds();
    expect(afterPull.ok && afterPull.value.map((f) => f.title)).toEqual([
      "From Other Device",
    ]);
    expect(pushVaultMock).not.toHaveBeenCalled();
  });
});
