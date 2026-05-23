/**
 * Lock-in test for the refresh-efficiency follow-up (D): after a
 * successful `refreshAllFeeds()`, the in-memory store reflects the
 * updated freshness directly from the returned `results` — no second
 * `getFeeds()` round-trip needed.
 *
 * The pre-refactor code path called `reloadFeeds(set)` twice — once
 * after the optional sync pull, and once after refreshAllFeeds. The
 * second call existed because freshness mutations on the DB-loaded
 * feeds weren't reflected in the store. Now we merge the results.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn(),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateFeed: vi.fn(async () => ({ ok: true, value: undefined })),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  refreshAllFeeds: vi.fn(),
  refreshFeed: vi.fn(),
}));

vi.mock("@/core/proxy/proxy-fetch.ts", () => ({
  proxyFetch: vi.fn(),
}));

import { useFeedStore } from "@/stores/feed-store";
import { getFeeds } from "@/core/storage/db";
import { refreshAllFeeds } from "@/core/feeds/feed-service";
import type { Feed } from "@/types";

const getFeedsMock = vi.mocked(getFeeds);
const refreshAllFeedsMock = vi.mocked(refreshAllFeeds);

function feed(
  id: string,
  overrides: Partial<Feed> = {},
): Feed {
  return {
    id,
    url: `https://example.com/${id}.xml`,
    title: id.toUpperCase(),
    description: "",
    siteUrl: "https://example.com",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("refreshAll — merges refresh results into the store directly", () => {
  beforeEach(() => {
    useFeedStore.setState({
      feeds: [
        feed("a", { lastFetchedAt: 1000, lastSuccessfulFetchAt: 1000 }),
        feed("b", { lastFetchedAt: 1000, lastSuccessfulFetchAt: 1000 }),
      ],
      folders: [],
      isRefreshingAll: false,
    });
    getFeedsMock.mockReset();
    refreshAllFeedsMock.mockReset();
  });

  afterEach(() => {
    useFeedStore.setState({ isRefreshingAll: false });
  });

  it("applies refreshed freshness to the existing in-memory feed entry", async () => {
    refreshAllFeedsMock.mockResolvedValue({
      ok: true,
      value: {
        results: [
          {
            feed: feed("a", { lastFetchedAt: 2000, lastSuccessfulFetchAt: 2000 }),
            newCount: 1,
            updatedCount: 0,
          },
        ],
      },
    });

    await useFeedStore.getState().refreshAll();

    const a = useFeedStore.getState().feeds.find((f) => f.id === "a");
    expect(a?.lastFetchedAt).toBe(2000);
    expect(a?.lastSuccessfulFetchAt).toBe(2000);
  });

  it("leaves unrefreshed (skipped) feeds at their existing in-memory state", async () => {
    // `b` doesn't appear in results — e.g. backoff filtered it out — so
    // its in-memory state must stay the previous-tick freshness.
    refreshAllFeedsMock.mockResolvedValue({
      ok: true,
      value: {
        results: [
          {
            feed: feed("a", { lastFetchedAt: 2000, lastSuccessfulFetchAt: 2000 }),
            newCount: 0,
            updatedCount: 0,
          },
        ],
      },
    });

    await useFeedStore.getState().refreshAll();

    const b = useFeedStore.getState().feeds.find((f) => f.id === "b");
    expect(b?.lastFetchedAt).toBe(1000);
    expect(b?.lastSuccessfulFetchAt).toBe(1000);
  });

  it("does NOT re-read the DB after refreshAllFeeds (the merge replaces the read)", async () => {
    // Sentinel: if the store calls getFeeds() after refreshAllFeeds, that's
    // the regression. The mock is set to throw so the leak fails loudly.
    getFeedsMock.mockImplementation(() => {
      throw new Error("getFeeds must not be called after refreshAllFeeds");
    });
    refreshAllFeedsMock.mockResolvedValue({
      ok: true,
      value: {
        results: [
          {
            feed: feed("a", { lastFetchedAt: 2000, lastSuccessfulFetchAt: 2000 }),
            newCount: 0,
            updatedCount: 0,
          },
        ],
      },
    });

    await expect(useFeedStore.getState().refreshAll()).resolves.toBeUndefined();
    expect(useFeedStore.getState().feeds.find((f) => f.id === "a")?.lastFetchedAt).toBe(
      2000,
    );
  });

  it("falls back to a DB reload when refreshAllFeeds itself errored", async () => {
    // A refresh-level failure (rare — DB read at the top of
    // refreshAllFeeds failed) loses the per-feed result granularity.
    // Falling back to a full DB read keeps the store in sync.
    getFeedsMock.mockResolvedValue({
      ok: true,
      value: [feed("a", { lastFetchedAt: 9999 })],
    });
    refreshAllFeedsMock.mockResolvedValue({
      ok: false,
      error: "DB error",
    });

    await useFeedStore.getState().refreshAll();

    expect(useFeedStore.getState().feeds.find((f) => f.id === "a")?.lastFetchedAt).toBe(
      9999,
    );
  });
});
