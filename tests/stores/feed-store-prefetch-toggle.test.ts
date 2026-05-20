/**
 * Per-feed prefetch toggle: setFeedPrefetchEnabled persists a boolean
 * flag on the feed and pushes through sync, so the choice rides to
 * other devices. Companion to addFeedPrefetchEnabled in the schema —
 * once the field exists on Feed, the mutator turns it on/off.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Feed } from "../../src/types/index.ts";

vi.mock("../../src/core/storage/db.ts", () => {
  const feeds = new Map<string, Feed>();
  return {
    getFeeds: vi.fn(async () => ({ ok: true, value: [...feeds.values()] })),
    getFeed: vi.fn(async (id: string) => {
      const f = feeds.get(id);
      return f
        ? { ok: true as const, value: f }
        : { ok: false as const, error: "not found" };
    }),
    updateFeed: vi.fn(async (feed: Feed) => {
      feeds.set(feed.id, feed);
      return { ok: true, value: true };
    }),
    addFolder: vi.fn(),
    getFolders: vi.fn(async () => ({ ok: true, value: [] })),
    updateFolder: vi.fn(),
    removeFolder: vi.fn(),
    removeFeed: vi.fn(async () => ({ ok: true, value: true })),
    _seed: (f: Feed) => feeds.set(f.id, f),
    _feeds: feeds,
    _reset: () => feeds.clear(),
  };
});

vi.mock("../../src/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
  reloadFeed: vi.fn(),
}));

vi.mock("../../src/core/extractor/prefetch-service.ts", () => ({
  prefetchStarredArticles: vi.fn().mockResolvedValue({
    ok: true,
    value: { extracted: 0, failed: 0 },
  }),
}));

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: Date.now() }),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

import { useFeedStore } from "../../src/stores/feed-store.ts";
import { useSyncStore } from "../../src/stores/sync-store.ts";
import * as db from "../../src/core/storage/db.ts";

const dbMock = db as unknown as {
  _seed: (f: Feed) => void;
  _feeds: Map<string, Feed>;
  _reset: () => void;
};

function feed(id: string, overrides: Partial<Feed> = {}): Feed {
  return {
    id,
    url: `https://example.com/${id}.xml`,
    title: id,
    description: "",
    siteUrl: "",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("feed-store setFeedPrefetchEnabled", () => {
  let pushSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dbMock._reset();
    vi.clearAllMocks();
    useFeedStore.setState({ feeds: [], folders: [] });
    pushSpy = vi
      .spyOn(useSyncStore.getState(), "scheduleSyncPush")
      .mockImplementation(() => {});
  });

  it("sets prefetchEnabled = true on the persisted feed", async () => {
    dbMock._seed(feed("f1"));
    await useFeedStore.getState().setFeedPrefetchEnabled("f1", true);
    expect(dbMock._feeds.get("f1")?.prefetchEnabled).toBe(true);
  });

  it("sets prefetchEnabled = false", async () => {
    dbMock._seed(feed("f1", { prefetchEnabled: true }));
    await useFeedStore.getState().setFeedPrefetchEnabled("f1", false);
    expect(dbMock._feeds.get("f1")?.prefetchEnabled).toBe(false);
  });

  it("schedules a sync push so the toggle rides to other devices", async () => {
    dbMock._seed(feed("f1"));
    await useFeedStore.getState().setFeedPrefetchEnabled("f1", true);
    expect(pushSpy).toHaveBeenCalled();
  });

  it("bumps updatedAt so the vault carries the newer timestamp", async () => {
    dbMock._seed(feed("f1", { updatedAt: 1 }));
    const before = Date.now();
    await useFeedStore.getState().setFeedPrefetchEnabled("f1", true);
    const after = Date.now();
    const persisted = dbMock._feeds.get("f1")!;
    expect(persisted.updatedAt).toBeGreaterThanOrEqual(before);
    expect(persisted.updatedAt).toBeLessThanOrEqual(after);
  });

  it("is a no-op for unknown feed ids", async () => {
    await useFeedStore.getState().setFeedPrefetchEnabled("ghost", true);
    expect(dbMock._feeds.size).toBe(0);
  });
});
