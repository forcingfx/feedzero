/**
 * prefetchFeedArticles: pre-extract the top-N most recent articles of
 * one feed that don't yet have extractedContent. Mirrors the starred-
 * prefetch shape (concurrency cap, age cutoff, no-op on missing fetch
 * URL) but scoped to a single feed instead of starred-state.
 *
 * Called by feed-store when a feed has prefetchEnabled: true; the
 * frequency heuristic (next commit) calls the same function with a
 * smaller N.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Article } from "@feedzero/core/types";

const { articles } = vi.hoisted(() => ({
  articles: new Map<string, Article>(),
}));

vi.mock("../../../src/core/storage/db.ts", () => ({
  getAllArticles: vi.fn(async () => ({
    ok: true,
    value: [...articles.values()],
  })),
  updateArticle: vi.fn(async (article: Article) => {
    articles.set(article.id, article);
    return { ok: true, value: true };
  }),
}));

vi.mock("../../../src/core/proxy/proxy-fetch.ts", () => ({
  proxyFetch: vi.fn().mockResolvedValue({
    ok: true,
    text: async () => "<html><body>irrelevant</body></html>",
  }),
}));

// Mock the extractor at the source so we don't depend on Defuddle's
// behaviour with toy HTML in this test. The fact that prefetchOne
// calls extract correctly is covered by the starred-prefetch suite.
vi.mock("../../../src/core/extractor/extractor.ts", () => ({
  extract: vi.fn(() => ({
    ok: true,
    value: { content: "<article>Extracted body</article>", title: "X" },
  })),
}));

import { prefetchFeedArticles } from "../../../src/core/extractor/prefetch-service.ts";

function article(id: string, feedId: string, overrides: Partial<Article> = {}): Article {
  return {
    id,
    feedId,
    guid: id,
    title: id,
    link: `https://example.com/${id}`,
    content: "",
    summary: "",
    author: "",
    publishedAt: Date.now() - parseInt(id.replace(/\D/g, ""), 10) * 1000,
    read: false,
    createdAt: 0,
    ...overrides,
  };
}

describe("prefetchFeedArticles", () => {
  beforeEach(() => {
    articles.clear();
    vi.clearAllMocks();
  });

  it("extracts the N most recent articles of the target feed that lack extractedContent", async () => {
    // Three from f1, two from f2 — only f1 should be touched.
    // publishedAt within the 90-day age cutoff.
    const now = Date.now();
    [
      article("a1", "f1", { publishedAt: now - 30 * 86400_000 }),
      article("a2", "f1", { publishedAt: now - 20 * 86400_000 }),
      article("a3", "f1", { publishedAt: now - 10 * 86400_000 }),
      article("b1", "f2", { publishedAt: now - 10 * 86400_000 }),
      article("b2", "f2", { publishedAt: now - 10 * 86400_000 }),
    ].forEach((a) => articles.set(a.id, a));

    const result = await prefetchFeedArticles("f1", 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.extracted).toBe(2);
    expect(result.value.failed).toBe(0);

    // The two newest f1 articles got extractedContent
    expect(articles.get("a3")?.extractedContent).toBeTruthy();
    expect(articles.get("a2")?.extractedContent).toBeTruthy();
    // The oldest one didn't (was outside the limit)
    expect(articles.get("a1")?.extractedContent).toBeFalsy();
    // f2 untouched
    expect(articles.get("b1")?.extractedContent).toBeFalsy();
    expect(articles.get("b2")?.extractedContent).toBeFalsy();
  });

  it("skips articles that already have extractedContent (idempotent across calls)", async () => {
    const now = Date.now();
    articles.set(
      "a1",
      article("a1", "f1", {
        publishedAt: now - 10 * 86400_000,
        extractedContent: "<p>cached</p>",
      }),
    );
    articles.set(
      "a2",
      article("a2", "f1", { publishedAt: now - 5 * 86400_000 }),
    );

    const result = await prefetchFeedArticles("f1", 10);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Only a2 needed extraction; a1 was already done.
    expect(result.value.extracted).toBe(1);
    // a1's cached content is unchanged
    expect(articles.get("a1")?.extractedContent).toBe("<p>cached</p>");
    // a2 now has extractedContent
    expect(articles.get("a2")?.extractedContent).toBeTruthy();
  });

  it("returns extracted: 0 when the feed has no candidate articles", async () => {
    const result = await prefetchFeedArticles("nonexistent-feed", 10);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.extracted).toBe(0);
    expect(result.value.failed).toBe(0);
  });

  it("respects the same age cutoff as starred prefetch", async () => {
    // 91 days old — should be skipped.
    const ancient = Date.now() - 91 * 24 * 60 * 60 * 1000;
    articles.set("a1", article("a1", "f1", { publishedAt: ancient }));

    const result = await prefetchFeedArticles("f1", 10);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.extracted).toBe(0);
  });
});
