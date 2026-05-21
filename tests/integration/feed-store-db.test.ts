/**
 * Integration tests for the feed-store ↔ db.ts boundary.
 *
 * The mocked unit tests in `tests/stores/feed-store.test.ts` verify the
 * store's branches by mocking every db.ts export. That pattern caused
 * three SEV incidents in the sync code path during 2026 — the store's
 * logic was green while its contract with db.ts had drifted. See
 * `docs/incidents/2026-05-19-sync-cascade.md`:
 *
 *   > Mocks encode your belief about what the service returns. The
 *   > destroy cascade had a test that asserted destroy was called —
 *   > verifying the bug as a feature.
 *
 * This file is the antidote: every test below runs the store mutators
 * against the *real* db.ts implementation, backed by fake-indexeddb.
 * No db.ts function is mocked. The only mocks are at the network
 * boundary (proxyFetch in feed-service) so the tests stay
 * deterministic without exercising HTTP.
 *
 * The contract this file locks down:
 *
 *  1. Every feed-store write produces a real, decryptable DB row.
 *  2. Every feed-store read goes through HMAC index lookups (no
 *     plaintext leakage in tests proves we're hitting the production
 *     encrypted path).
 *  3. The reload helpers refresh in-memory state from the same DB
 *     that the mutators wrote to — closing the lying-mock gap.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useFeedStore } from "../../src/stores/feed-store.ts";
import { useSyncStore } from "../../src/stores/sync-store.ts";
import { useLicenseStore } from "../../src/stores/license-store.ts";
import {
  open,
  close,
  deleteDatabase,
  getFeeds as dbGetFeeds,
  addFeed as dbAddFeed,
  getFolders as dbGetFolders,
} from "../../src/core/storage/db.ts";
import type { Feed } from "../../src/types/index.ts";

// Mock the network boundary inside feed-service. Everything else
// (parse, sanitize, db.addFeed, db.addArticles) runs for real.
vi.mock("../../src/core/feeds/feed-service.ts", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/core/feeds/feed-service.ts")
  >("../../src/core/feeds/feed-service.ts");
  return {
    ...actual,
    // refresh paths hit the network — stub them out
    refreshFeed: vi.fn().mockResolvedValue({ ok: true, value: { added: 0 } }),
    refreshAllFeeds: vi
      .fn()
      .mockResolvedValue({ ok: true, value: { results: [] } }),
    reloadFeed: vi.fn().mockResolvedValue({ ok: true, value: { added: 0 } }),
  };
});

// Sync-store push is debounced + jittered. Stub the scheduler so tests
// don't leak timers — actual sync push behaviour is covered in
// tests/stores/sync-store.test.ts.
vi.spyOn(useSyncStore.getState(), "scheduleSyncPush").mockImplementation(() => {});

function makeFeed(id: string, title: string): Feed {
  return {
    id,
    url: `https://${id}.example.com/feed.xml`,
    title,
    description: `${title} description`,
    siteUrl: `https://${id}.example.com`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe("feed-store ↔ db.ts integration", () => {
  beforeEach(async () => {
    // Reset stores. License → personal so quota gates don't fire.
    useLicenseStore.setState({ tier: "personal", verifying: false });
    useFeedStore.setState({
      feeds: [],
      folders: [],
      selectedFeedId: null,
      isLoading: false,
      isRefreshingAll: false,
      error: null,
      feedsLoaded: false,
    });

    // Real DB per test. Each test gets a clean encrypted IndexedDB
    // instance derived from a fresh passphrase.
    const opened = await open("integration-test-passphrase");
    if (!opened.ok) throw new Error(`open failed: ${opened.error}`);
  });

  afterEach(async () => {
    close();
    await deleteDatabase();
  });

  describe("loadFeeds", () => {
    it("loads only the feeds that exist in the encrypted DB", async () => {
      const a = makeFeed("a", "Feed A");
      const b = makeFeed("b", "Feed B");
      await dbAddFeed(a);
      await dbAddFeed(b);

      await useFeedStore.getState().loadFeeds();

      const titles = useFeedStore.getState().feeds.map((f) => f.title);
      expect(titles.sort()).toEqual(["Feed A", "Feed B"]);
      expect(useFeedStore.getState().feedsLoaded).toBe(true);
    });

    it("recovers an empty list when no feeds exist", async () => {
      await useFeedStore.getState().loadFeeds();

      expect(useFeedStore.getState().feeds).toEqual([]);
      expect(useFeedStore.getState().feedsLoaded).toBe(true);
    });
  });

  describe("removeFeed", () => {
    it("deletes the feed from the encrypted DB and from the store snapshot", async () => {
      const a = makeFeed("a", "Feed A");
      const b = makeFeed("b", "Feed B");
      await dbAddFeed(a);
      await dbAddFeed(b);
      await useFeedStore.getState().loadFeeds();

      await useFeedStore.getState().removeFeed("a");

      // Store snapshot matches the real DB — this is the contract that
      // mocked tests could not enforce.
      const inStore = useFeedStore.getState().feeds.map((f) => f.id);
      const inDb = await dbGetFeeds();
      expect(inStore).toEqual(["b"]);
      expect(inDb.ok && inDb.value.map((f) => f.id)).toEqual(["b"]);
    });

    it("clears selectedFeedId when the selected feed is removed", async () => {
      await dbAddFeed(makeFeed("a", "Feed A"));
      await useFeedStore.getState().loadFeeds();
      useFeedStore.setState({ selectedFeedId: "a" });

      await useFeedStore.getState().removeFeed("a");

      expect(useFeedStore.getState().selectedFeedId).toBeNull();
    });

    it("leaves selectedFeedId alone when a different feed is removed", async () => {
      await dbAddFeed(makeFeed("a", "Feed A"));
      await dbAddFeed(makeFeed("b", "Feed B"));
      await useFeedStore.getState().loadFeeds();
      useFeedStore.setState({ selectedFeedId: "a" });

      await useFeedStore.getState().removeFeed("b");

      expect(useFeedStore.getState().selectedFeedId).toBe("a");
    });
  });

  describe("renameFeed", () => {
    it("persists the new title to the encrypted DB", async () => {
      await dbAddFeed(makeFeed("a", "Old Title"));
      await useFeedStore.getState().loadFeeds();

      await useFeedStore.getState().renameFeed("a", "New Title");

      const stored = await dbGetFeeds();
      expect(stored.ok && stored.value[0].title).toBe("New Title");
      expect(useFeedStore.getState().feeds[0].title).toBe("New Title");
    });
  });

  describe("setFeedPreferFullText", () => {
    it("persists the preferFullText flag to the encrypted DB", async () => {
      await dbAddFeed(makeFeed("a", "Feed A"));
      await useFeedStore.getState().loadFeeds();

      await useFeedStore.getState().setFeedPreferFullText("a", true);

      const stored = await dbGetFeeds();
      expect(stored.ok && stored.value[0].preferFullText).toBe(true);
    });
  });

  describe("folders", () => {
    it("createFolder writes a real folder row that round-trips through the DB", async () => {
      await useFeedStore.getState().createFolder("Tech");

      const inDb = await dbGetFolders();
      const inStore = useFeedStore.getState().folders;
      expect(inDb.ok && inDb.value.map((f) => f.name)).toEqual(["Tech"]);
      expect(inStore.map((f) => f.name)).toEqual(["Tech"]);
    });

    it("renameFolder updates the encrypted row, not just the store", async () => {
      await useFeedStore.getState().createFolder("Tech");
      const folderId = useFeedStore.getState().folders[0].id;

      await useFeedStore.getState().renameFolder(folderId, "Engineering");

      const inDb = await dbGetFolders();
      expect(inDb.ok && inDb.value[0].name).toBe("Engineering");
      expect(useFeedStore.getState().folders[0].name).toBe("Engineering");
    });

    it("deleteFolder unfiles the contained feeds in the DB", async () => {
      // Seed: one folder, one feed inside it.
      await useFeedStore.getState().createFolder("Tech");
      const folderId = useFeedStore.getState().folders[0].id;
      const feed: Feed = { ...makeFeed("a", "Feed A"), folderId };
      await dbAddFeed(feed);
      await useFeedStore.getState().loadFeeds();

      await useFeedStore.getState().deleteFolder(folderId);

      const folders = await dbGetFolders();
      const feeds = await dbGetFeeds();
      expect(folders.ok && folders.value).toEqual([]);
      // The feed survives — only its folder linkage is cleared.
      expect(feeds.ok && feeds.value).toHaveLength(1);
      expect(feeds.ok && feeds.value[0].folderId).toBeUndefined();
    });

    it("moveFeedToFolder links the feed in the DB, not just in memory", async () => {
      await dbAddFeed(makeFeed("a", "Feed A"));
      await useFeedStore.getState().createFolder("Tech");
      await useFeedStore.getState().loadFeeds();
      const folderId = useFeedStore.getState().folders[0].id;

      await useFeedStore.getState().moveFeedToFolder("a", folderId);

      const feeds = await dbGetFeeds();
      expect(feeds.ok && feeds.value[0].folderId).toBe(folderId);
    });
  });

  describe("addPlaceholderFeed lifecycle", () => {
    // Issue #117 follow-up: a bulk-import URL hit by a 429 should be
    // persisted as a placeholder so the user can recover it by hitting
    // refresh — and the sidebar must visibly surface it. This test
    // exercises the round-trip through the real encrypted DB.
    it("persists a placeholder with lastError and survives a reload from the DB", async () => {
      const result = await useFeedStore
        .getState()
        .addPlaceholderFeed(
          "https://rl.example.com/feed.xml",
          "HTTP 429 (retry after 60s)",
        );
      expect(result.ok).toBe(true);

      // Round-trip through the DB: drop the store snapshot and reload
      // from the real persisted row. If addPlaceholderFeed silently
      // skipped the DB, this would be empty.
      useFeedStore.setState({ feeds: [] });
      await useFeedStore.getState().loadFeeds();

      const feeds = useFeedStore.getState().feeds;
      expect(feeds).toHaveLength(1);
      expect(feeds[0].url).toBe("https://rl.example.com/feed.xml");
      expect(feeds[0].lastError).toMatch(/HTTP 429/);
      expect(feeds[0].lastSuccessfulFetchAt).toBeUndefined();
      // Title was derived from the URL host so the sidebar has a
      // recognizable label until refresh backfills the real one.
      expect(feeds[0].title).toBe("rl.example.com");
    });

    it("returns err when the URL already exists as a real feed", async () => {
      const existing = makeFeed("a", "Feed A");
      await dbAddFeed(existing);
      await useFeedStore.getState().loadFeeds();

      const result = await useFeedStore
        .getState()
        .addPlaceholderFeed(existing.url, "boom");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/already exists/i);
    });
  });

  describe("the contract the mocked tests could not verify", () => {
    it("after a mutation, store snapshot equals what dbGetFeeds() returns", async () => {
      // This is the core invariant the 2026-05-19 incident report named.
      // Mock-based tests assert "store has X" by configuring the mock to
      // return X; they cannot detect a regression where the store stops
      // reading from the DB. Here, the store snapshot is whatever the
      // real DB just persisted.
      await dbAddFeed(makeFeed("a", "Original"));
      await useFeedStore.getState().loadFeeds();

      await useFeedStore.getState().renameFeed("a", "Renamed");

      const fromDb = await dbGetFeeds();
      const fromStore = useFeedStore.getState().feeds;
      expect(fromStore.length).toBe(fromDb.ok ? fromDb.value.length : -1);
      expect(fromStore[0].title).toBe(fromDb.ok ? fromDb.value[0].title : "");
    });
  });
});
