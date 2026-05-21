import { describe, it, expect } from "vitest";
import { generateReport } from "@/core/signal/frequency-engine.ts";
import { SIGNAL_MIN_PER_WINDOW } from "@/core/signal/types.ts";
import { isOk } from "@/utils/result.ts";
import type { Article, Feed } from "@/types/index.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-05-21T12:00:00Z").getTime();

function makeFeed(id: string): Feed {
  return {
    id,
    url: `https://example.com/${id}.xml`,
    title: `Feed ${id}`,
    description: "",
    siteUrl: `https://example.com/${id}`,
    createdAt: NOW - 60 * DAY,
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

const FEEDS: Feed[] = Array.from({ length: 4 }, (_, i) => makeFeed(`f${i + 1}`));

describe("adaptive window selection", () => {
  it("picks 7d when the 7-day window has ≥ SIGNAL_MIN_PER_WINDOW articles", () => {
    const articles: Article[] = [];
    for (let i = 0; i < SIGNAL_MIN_PER_WINDOW + 10; i++) {
      articles.push(makeArticle(`a-${i}`, `f${(i % 4) + 1}`, `Title ${i}`, i % 7));
    }
    const result = generateReport(articles, { feeds: FEEDS }, NOW);
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.window).toBe("7d");
  });

  it("widens to 14d when 7d has too few articles but 14d has enough", () => {
    const articles: Article[] = [];
    // 30 articles spread across 0..13 days — 7d holds ~15, 14d holds all 30.
    // Force 14d ≥ MIN by adding extra in the 7-13 day band.
    for (let i = 0; i < 30; i++) {
      const age = 7 + (i % 6); // ages 7-12 days
      articles.push(makeArticle(`a-old-${i}`, `f${(i % 4) + 1}`, `Older ${i}`, age));
    }
    // 20 fresh ones inside 7d so 7d count is 20 (< 50).
    for (let i = 0; i < 20; i++) {
      articles.push(makeArticle(`a-fresh-${i}`, `f${(i % 4) + 1}`, `Fresh ${i}`, i % 6));
    }
    const result = generateReport(articles, { feeds: FEEDS }, NOW);
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.window).toBe("14d");
    expect(result.value.corpusInWindow).toBeGreaterThanOrEqual(SIGNAL_MIN_PER_WINDOW);
  });

  it("widens to 30d when 14d also has too few", () => {
    const articles: Article[] = [];
    for (let i = 0; i < SIGNAL_MIN_PER_WINDOW + 5; i++) {
      const age = 15 + (i % 14); // ages 15-28 days
      articles.push(makeArticle(`a-${i}`, `f${(i % 4) + 1}`, `Title ${i}`, age));
    }
    const result = generateReport(articles, { feeds: FEEDS }, NOW);
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.window).toBe("30d");
  });

  it("falls back to all when every windowed view has < SIGNAL_MIN_PER_WINDOW", () => {
    const articles: Article[] = [];
    // Sparse 40 articles spanning a year — every window is < 50.
    for (let i = 0; i < 40; i++) {
      articles.push(makeArticle(`a-${i}`, `f${(i % 4) + 1}`, `Title ${i}`, i * 10));
    }
    const result = generateReport(articles, { feeds: FEEDS }, NOW);
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.window).toBe("all");
    expect(result.value.corpusInWindow).toBe(40);
  });
});
