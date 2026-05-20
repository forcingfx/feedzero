/**
 * refreshAll → schedulePrefetch passes the current feeds to the
 * prefetch dispatcher. Feeds with prefetchEnabled get their N most
 * recent articles pre-extracted (via prefetchFeedArticles), in
 * addition to the always-on starred pass.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import type { Feed } from "../../src/types/index.ts";

const { feeds, articles } = vi.hoisted(() => ({
  feeds: new Map<string, Feed>(),
  articles: [] as { id: string; feedId: string; readAt?: number; [k: string]: unknown }[],
}));

vi.mock("../../src/core/storage/db.ts", () => ({
  getFeeds: vi.fn(async () => ({ ok: true, value: [...feeds.values()] })),
  getFeed: vi.fn(async (id: string) => {
    const f = feeds.get(id);
    return f
      ? { ok: true as const, value: f }
      : { ok: false as const, error: "not found" };
  }),
  updateFeed: vi.fn(async (f: Feed) => {
    feeds.set(f.id, f);
    return { ok: true, value: true };
  }),
  addFolder: vi.fn(),
  getFolders: vi.fn(async () => ({ ok: true, value: [] })),
  updateFolder: vi.fn(),
  removeFolder: vi.fn(),
  removeFeed: vi.fn(),
  getAllArticles: vi.fn(async () => ({ ok: true, value: articles })),
}));

vi.mock("../../src/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn().mockResolvedValue({ ok: true, value: { results: [] } }),
  reloadFeed: vi.fn(),
}));

// Mock only the I/O-bound prefetch functions; keep the pure
// selectFrequentFeeds + the THRESHOLD/WINDOW constants real so the
// heuristic is exercised end-to-end with realistic logic.
vi.mock("../../src/core/extractor/prefetch-service.ts", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../src/core/extractor/prefetch-service.ts")
  >();
  return {
    ...actual,
    prefetchStarredArticles: vi.fn().mockResolvedValue({
      ok: true,
      value: { extracted: 0, failed: 0 },
    }),
    prefetchFeedArticles: vi.fn().mockResolvedValue({
      ok: true,
      value: { extracted: 0, failed: 0 },
    }),
  };
});

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

// Force paid-tier active so the offline-prefetch gate enforces tiers.
vi.mock("../../src/core/features/paid-tier-active.ts", () => ({
  isPaidTierActive: () => true,
}));

import { useFeedStore } from "../../src/stores/feed-store.ts";
import { useLicenseStore } from "../../src/stores/license-store.ts";
import {
  prefetchStarredArticles,
  prefetchFeedArticles,
} from "../../src/core/extractor/prefetch-service.ts";
import { FREQUENCY_THRESHOLD } from "../../src/core/extractor/prefetch-service.ts";

const dbMock = {
  _seed: (f: Feed) => feeds.set(f.id, f),
  _reset: () => {
    feeds.clear();
    articles.length = 0;
  },
  _seedReads: (feedId: string, count: number, readAt = Date.now()) => {
    for (let i = 0; i < count; i++) {
      articles.push({ id: `${feedId}-${i}`, feedId, readAt });
    }
  },
};

function feed(id: string, prefetchEnabled?: boolean): Feed {
  return {
    id,
    url: `https://example.com/${id}.xml`,
    title: id,
    description: "",
    siteUrl: "",
    createdAt: 0,
    updatedAt: 0,
    ...(prefetchEnabled !== undefined ? { prefetchEnabled } : {}),
  };
}

describe("refreshAll triggers feed-prefetch for prefetchEnabled feeds", () => {
  beforeEach(() => {
    dbMock._reset();
    vi.clearAllMocks();
    useLicenseStore.setState({ tier: "personal" });
    useFeedStore.setState({ feeds: [], folders: [] });
  });

  it("calls prefetchFeedArticles for every feed with prefetchEnabled = true", async () => {
    dbMock._seed(feed("f-tech", true));
    dbMock._seed(feed("f-news"));
    dbMock._seed(feed("f-blogs", true));
    await useFeedStore.getState().loadFeeds();

    await useFeedStore.getState().refreshAll();

    await waitFor(() =>
      expect(prefetchFeedArticles).toHaveBeenCalledTimes(2),
    );
    const calls = (
      prefetchFeedArticles as unknown as { mock: { calls: [string, number][] } }
    ).mock.calls.map((c) => c[0]).sort();
    expect(calls).toEqual(["f-blogs", "f-tech"]);
  });

  it("still runs the starred pass even when no feeds have prefetchEnabled", async () => {
    dbMock._seed(feed("f1"));
    await useFeedStore.getState().loadFeeds();

    await useFeedStore.getState().refreshAll();

    await waitFor(() => expect(prefetchStarredArticles).toHaveBeenCalled());
    expect(prefetchFeedArticles).not.toHaveBeenCalled();
  });

  it("skips both passes for free users (gate-locked offline-prefetch)", async () => {
    useLicenseStore.setState({ tier: "free" });
    dbMock._seed(feed("f1", true));
    await useFeedStore.getState().loadFeeds();

    await useFeedStore.getState().refreshAll();

    // Give the fire-and-forget call a microtask to run — and verify
    // it still doesn't kick off either pass.
    await new Promise((r) => setTimeout(r, 10));
    expect(prefetchStarredArticles).not.toHaveBeenCalled();
    expect(prefetchFeedArticles).not.toHaveBeenCalled();
  });

  it("auto-prefetches frequently-read feeds via the heuristic, without the explicit toggle", async () => {
    dbMock._seed(feed("f-hot"));
    dbMock._seed(feed("f-quiet"));
    dbMock._seedReads("f-hot", FREQUENCY_THRESHOLD);
    dbMock._seedReads("f-quiet", 2);
    await useFeedStore.getState().loadFeeds();

    await useFeedStore.getState().refreshAll();

    await waitFor(() =>
      expect(prefetchFeedArticles).toHaveBeenCalledTimes(1),
    );
    expect(
      (prefetchFeedArticles as unknown as { mock: { calls: [string][] } }).mock
        .calls[0][0],
    ).toBe("f-hot");
  });

  it("does not double-prefetch a feed that's both toggled and frequently-read", async () => {
    dbMock._seed(feed("f-hot", true));
    dbMock._seedReads("f-hot", FREQUENCY_THRESHOLD);
    await useFeedStore.getState().loadFeeds();

    await useFeedStore.getState().refreshAll();

    await waitFor(() =>
      expect(prefetchFeedArticles).toHaveBeenCalledTimes(1),
    );
  });
});
