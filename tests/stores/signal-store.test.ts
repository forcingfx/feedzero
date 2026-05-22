import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useSignalStore, SIGNAL_REPORT_CACHE_KEY } from "@/stores/signal-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { SIGNAL_CORPUS_GATE } from "@/core/signal/types.ts";
import type { Article, Feed } from "@/types/index.ts";

const NOW = new Date("2026-05-21T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

function makeFeed(id: string): Feed {
  return {
    id,
    url: `https://example.com/${id}.xml`,
    title: `Feed ${id}`,
    description: "",
    siteUrl: `https://example.com/${id}`,
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW - DAY,
  };
}

function makeArticle(id: string, feedId: string, title: string, ageDays: number): Article {
  const publishedAt = NOW - ageDays * DAY;
  return {
    id,
    feedId,
    guid: id,
    title,
    link: `https://example.com/${id}`,
    content: "",
    summary: "",
    author: "",
    publishedAt,
    read: false,
    createdAt: publishedAt,
  };
}

function seedFeedsAndArticles(feedCount: number, articleCount: number, baseTitle = "OpenAI launches Atlas") {
  const feeds: Feed[] = Array.from({ length: feedCount }, (_, i) => makeFeed(`f${i + 1}`));
  const articlesByFeedId: Record<string, Article[]> = {};
  for (let i = 0; i < articleCount; i++) {
    const feedId = `f${(i % feedCount) + 1}`;
    if (!articlesByFeedId[feedId]) articlesByFeedId[feedId] = [];
    articlesByFeedId[feedId].push(
      makeArticle(`a-${i}`, feedId, `${baseTitle} ${i}`, i % 5),
    );
  }
  useFeedStore.setState({ feeds });
  useArticleStore.setState({ articlesByFeedId });
}

describe("signal-store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    localStorage.clear();
    useSignalStore.setState({
      status: "idle",
      report: null,
      corpusSize: 0,
      error: null,
    });
    useFeedStore.setState({ feeds: [] });
    useArticleStore.setState({ articlesByFeedId: {} });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions idle → locked when fewer than SIGNAL_CORPUS_GATE articles exist", async () => {
    seedFeedsAndArticles(6, SIGNAL_CORPUS_GATE - 1);
    await useSignalStore.getState().loadReport();
    const state = useSignalStore.getState();
    expect(state.status).toBe("locked");
    expect(state.corpusSize).toBe(SIGNAL_CORPUS_GATE - 1);
    expect(state.report).toBeNull();
  });

  it("transitions idle → loading → ready at >= SIGNAL_CORPUS_GATE articles", async () => {
    seedFeedsAndArticles(6, SIGNAL_CORPUS_GATE + 20);
    const promise = useSignalStore.getState().loadReport();
    expect(useSignalStore.getState().status).toBe("loading");
    await promise;
    const state = useSignalStore.getState();
    expect(state.status).toBe("ready");
    expect(state.report).not.toBeNull();
    expect(state.report?.topics.length).toBeGreaterThan(0);
  });

  it("stays at ready with empty topics when corpus has no cross-feed signal", async () => {
    // All articles on a single feed → no cross-feed terms.
    const feeds: Feed[] = [makeFeed("solo")];
    const articlesByFeedId: Record<string, Article[]> = { solo: [] };
    for (let i = 0; i < SIGNAL_CORPUS_GATE + 10; i++) {
      articlesByFeedId.solo.push(makeArticle(`a-${i}`, "solo", `Unique headline ${i}`, i % 5));
    }
    useFeedStore.setState({ feeds });
    useArticleStore.setState({ articlesByFeedId });

    await useSignalStore.getState().loadReport();
    const state = useSignalStore.getState();
    expect(state.status).toBe("ready");
    expect(state.report?.topics).toEqual([]);
  });

  it("reads from cache within TTL and does not recompute", async () => {
    seedFeedsAndArticles(6, SIGNAL_CORPUS_GATE + 20);
    await useSignalStore.getState().loadReport();
    const firstGeneratedAt = useSignalStore.getState().report?.generatedAt;

    // Advance time by 1 hour (well inside the 24h TTL) and reload.
    vi.setSystemTime(NOW + 60 * 60 * 1000);
    useSignalStore.setState({ status: "idle", report: null });
    await useSignalStore.getState().loadReport();

    const secondGeneratedAt = useSignalStore.getState().report?.generatedAt;
    expect(secondGeneratedAt).toBe(firstGeneratedAt);
  });

  it("force-reloads bypass the cache", async () => {
    seedFeedsAndArticles(6, SIGNAL_CORPUS_GATE + 20);
    await useSignalStore.getState().loadReport();
    const firstGeneratedAt = useSignalStore.getState().report?.generatedAt;

    vi.setSystemTime(NOW + 60 * 60 * 1000);
    await useSignalStore.getState().loadReport({ force: true });
    const secondGeneratedAt = useSignalStore.getState().report?.generatedAt;
    expect(secondGeneratedAt).toBe(NOW + 60 * 60 * 1000);
    expect(secondGeneratedAt).not.toBe(firstGeneratedAt);
  });

  it("invalidates cache when the chosen window changes", async () => {
    // First run: dense corpus → 7d window.
    seedFeedsAndArticles(6, SIGNAL_CORPUS_GATE + 50);
    await useSignalStore.getState().loadReport();
    expect(useSignalStore.getState().report?.window).toBe("7d");
    const firstGeneratedAt = useSignalStore.getState().report?.generatedAt;

    // Simulate the corpus drying up in the recent window: replace articles
    // with older ones so picking 7d no longer hits the minimum, forcing a
    // wider window. Then reload — cache should NOT serve the 7d result.
    const olderArticles: Record<string, Article[]> = {};
    for (let i = 0; i < SIGNAL_CORPUS_GATE + 50; i++) {
      const feedId = `f${(i % 6) + 1}`;
      if (!olderArticles[feedId]) olderArticles[feedId] = [];
      olderArticles[feedId].push(
        makeArticle(`a-${i}`, feedId, `OpenAI Atlas update ${i}`, 15 + (i % 14)),
      );
    }
    useArticleStore.setState({ articlesByFeedId: olderArticles });
    vi.setSystemTime(NOW + 60 * 60 * 1000); // still inside 24h TTL
    await useSignalStore.getState().loadReport();
    const second = useSignalStore.getState().report;
    expect(second?.window).not.toBe("7d");
    expect(second?.generatedAt).not.toBe(firstGeneratedAt);
  });

  it("invalidates cache when corpus size shifts by more than 10%", async () => {
    seedFeedsAndArticles(6, 120);
    await useSignalStore.getState().loadReport();
    const firstGeneratedAt = useSignalStore.getState().report?.generatedAt;

    // Add 20 articles (16% growth) — should trigger recompute.
    const existing = { ...useArticleStore.getState().articlesByFeedId };
    for (let i = 0; i < 20; i++) {
      const feedId = `f${(i % 6) + 1}`;
      existing[feedId] = existing[feedId].concat(
        makeArticle(`b-${i}`, feedId, `OpenAI Atlas update ${i}`, i % 5),
      );
    }
    useArticleStore.setState({ articlesByFeedId: existing });
    vi.setSystemTime(NOW + 60 * 60 * 1000);
    await useSignalStore.getState().loadReport();
    const second = useSignalStore.getState().report;
    expect(second?.generatedAt).not.toBe(firstGeneratedAt);
  });

  it("persists the report to localStorage and survives a state reset", async () => {
    seedFeedsAndArticles(6, SIGNAL_CORPUS_GATE + 20);
    await useSignalStore.getState().loadReport();
    expect(localStorage.getItem(SIGNAL_REPORT_CACHE_KEY)).not.toBeNull();

    // Simulate a fresh app reload by resetting store state but keeping
    // localStorage intact and the article corpus consistent.
    useSignalStore.setState({ status: "idle", report: null, corpusSize: 0 });
    vi.setSystemTime(NOW + 30 * 60 * 1000); // within TTL
    await useSignalStore.getState().loadReport();
    expect(useSignalStore.getState().status).toBe("ready");
  });
});
