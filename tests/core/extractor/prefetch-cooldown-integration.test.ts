/**
 * prefetch + cooldown integration: when /api/page returns 429,
 * prefetch must (1) record a cooldown so further passes back off,
 * and (2) stop the in-flight batch instead of grinding through
 * every candidate while every fetch comes back 429.
 *
 * Without this, a user with prefetch enabled or several frequent
 * feeds bursts 20+ /api/page requests per refresh, exhausts the
 * 300/60s rate limit, and then every subsequent manual "Full text"
 * click silently fails for the rest of the window (see 2026-05-25
 * extraction silent-fail report).
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
  proxyFetch: vi.fn(),
}));

vi.mock("../../../src/core/extractor/extractor.ts", () => ({
  extract: vi.fn(() => ({
    ok: true,
    value: { content: "<article>x</article>", title: "x" },
  })),
}));

import { prefetchFeedArticles } from "../../../src/core/extractor/prefetch-service.ts";
import {
  clearCooldown,
  isInCooldown,
  signalRateLimited,
} from "../../../src/core/extractor/prefetch-cooldown.ts";
import { proxyFetch } from "../../../src/core/proxy/proxy-fetch.ts";

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

describe("prefetch backs off when rate-limited", () => {
  beforeEach(() => {
    articles.clear();
    vi.clearAllMocks();
    clearCooldown();
  });

  it("skips the whole batch when isInCooldown() is true at start", async () => {
    signalRateLimited(60);
    const now = Date.now();
    for (let i = 1; i <= 5; i++) {
      articles.set(
        `a${i}`,
        article(`a${i}`, "f1", { publishedAt: now - i * 1000 }),
      );
    }

    const result = await prefetchFeedArticles("f1", 5);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.extracted).toBe(0);
    // Critical: no upstream fetches were issued — we did NOT compete
    // with the user's manual click for the rate-limit bucket.
    expect(proxyFetch).not.toHaveBeenCalled();
  });

  it("when the FIRST in-flight fetch returns 429, signals cooldown and aborts the rest", async () => {
    const now = Date.now();
    for (let i = 1; i <= 10; i++) {
      articles.set(
        `a${i}`,
        article(`a${i}`, "f1", { publishedAt: now - i * 1000 }),
      );
    }

    // Every fetch in this test 429s — verifies that prefetch sees the
    // signal early and gives up rather than hammering all 10 articles.
    vi.mocked(proxyFetch).mockResolvedValue(
      new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "45" },
      }),
    );

    const result = await prefetchFeedArticles("f1", 10);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.extracted).toBe(0);
    // We expect FAR fewer than 10 fetches — the worker pool sees the
    // 429, sets cooldown, and the remaining workers exit on the
    // cooldown check. Concurrency is 3, so a strict bound is at most
    // the three in-flight workers (each starts before they see the
    // cooldown signal) + a couple of in-progress checks. We assert <= 6
    // as a generous ceiling — if every candidate fetches, that's > 6.
    expect(vi.mocked(proxyFetch).mock.calls.length).toBeLessThanOrEqual(6);

    // Cooldown was set from the 429's Retry-After header.
    expect(isInCooldown()).toBe(true);
  });
});
