import { describe, it, expect } from "vitest";
import { generateReport } from "@/core/signal/frequency-engine.ts";
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
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW - DAY,
  };
}

function makeArticle(
  id: string,
  feedId: string,
  title: string,
  ageDays: number,
  content = "",
): Article {
  const publishedAt = NOW - ageDays * DAY;
  return {
    id,
    feedId,
    guid: id,
    title,
    link: `https://example.com/${id}`,
    content,
    summary: "",
    author: "",
    publishedAt,
    read: false,
    createdAt: publishedAt,
  };
}

const FEEDS: Feed[] = Array.from({ length: 6 }, (_, i) => makeFeed(`f${i + 1}`));

describe("frequency engine — edge cases", () => {
  it("dedupes near-identical syndicated articles by normalized title", () => {
    const articles: Article[] = [];
    // 60 distinct headlines mostly, but one story syndicated across 6 feeds
    // with slight punctuation variation. After dedupe, only one should survive.
    for (let i = 0; i < 54; i++) {
      articles.push(makeArticle(`a-${i}`, `f${(i % 6) + 1}`, `Unique headline number ${i}`, i % 6));
    }
    const syndicated = [
      "Breaking: Mayor resigns!",
      "Breaking - mayor resigns",
      "BREAKING: Mayor Resigns.",
      "Breaking, Mayor resigns",
      "BREAKING MAYOR RESIGNS",
      "breaking: mayor resigns",
    ];
    syndicated.forEach((title, i) => {
      articles.push(makeArticle(`a-syn-${i}`, `f${i + 1}`, title, 2));
    });
    const result = generateReport(articles, { feeds: FEEDS }, NOW);
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;
    // After dedupe, "mayor" / "resign" / "breaking" should NOT form a
    // cross-feed cluster — they only survive on one article.
    const mayorTopic = result.value.topics.find((t) => t.term === "mayor");
    expect(mayorTopic).toBeUndefined();
  });

  it("produces no topics when corpus is ≥ 100 articles but every term lives in one feed", () => {
    const articles: Article[] = [];
    // 60 articles, all on f1, all distinct words.
    for (let i = 0; i < 60; i++) {
      articles.push(makeArticle(`a-${i}`, "f1", `Singleton subject ${i}`, i % 6));
    }
    const result = generateReport(articles, { feeds: FEEDS }, NOW);
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.topics).toEqual([]);
  });

  it("falls back to body tokens when the title yields nothing useful", () => {
    const articles: Article[] = [];
    for (let i = 0; i < 60; i++) {
      // Title is just punctuation/numbers — nothing tokenizable.
      articles.push(
        makeArticle(
          `a-${i}`,
          `f${(i % 6) + 1}`,
          `... ${i}`,
          i % 6,
          `OpenAI shipped quarterly results outpacing analyst forecasts ${i}`,
        ),
      );
    }
    const result = generateReport(articles, { feeds: FEEDS }, NOW);
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;
    const terms = result.value.topics.map((t) => t.term);
    expect(terms).toContain("openai");
  });

  it("is deterministic across two runs on the same input", () => {
    const articles: Article[] = [];
    for (let i = 0; i < 60; i++) {
      const cluster = i % 3;
      const word = cluster === 0 ? "OpenAI" : cluster === 1 ? "Tariffs" : "Election";
      articles.push(makeArticle(`a-${i}`, `f${(i % 6) + 1}`, `${word} update number ${i}`, i % 6));
    }
    const first = generateReport(articles, { feeds: FEEDS }, NOW);
    const second = generateReport([...articles].reverse(), { feeds: FEEDS }, NOW);
    expect(isOk(first) && isOk(second)).toBe(true);
    if (!first.ok || !second.ok) return;
    // Ignore corpus stats (they're equal anyway); compare topic order +
    // article ids strictly.
    const firstShape = first.value.topics.map((t) => ({ term: t.term, ids: [...t.articleIds] }));
    const secondShape = second.value.topics.map((t) => ({ term: t.term, ids: [...t.articleIds] }));
    expect(secondShape).toEqual(firstShape);
  });

  it("does not throw on non-English content; just produces fewer topics", () => {
    const articles: Article[] = [];
    for (let i = 0; i < 60; i++) {
      articles.push(makeArticle(`a-${i}`, `f${(i % 6) + 1}`, `日本語の記事 ${i} について`, i % 6));
    }
    expect(() => generateReport(articles, { feeds: FEEDS }, NOW)).not.toThrow();
    const result = generateReport(articles, { feeds: FEEDS }, NOW);
    expect(isOk(result)).toBe(true);
  });

  it("respects the per-topic claim cap so a dominant term cannot swallow the corpus", () => {
    const articles: Article[] = [];
    // 100 articles, all about openai, but tokens vary so other terms could
    // still form clusters if the cap didn't apply. Each article also
    // contains a distinct second proper noun to seed a smaller cluster.
    for (let i = 0; i < 100; i++) {
      articles.push(
        makeArticle(`a-${i}`, `f${(i % 6) + 1}`, `OpenAI partners with Acme Corp ${i}`, i % 5),
      );
    }
    const result = generateReport(articles, { feeds: FEEDS }, NOW);
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;
    const openai = result.value.topics.find((t) => t.term === "openai");
    expect(openai).toBeDefined();
    // Cluster cap = ceil(N/SIGNAL_TOPIC_TARGET) + 5 with N=100 → 15. So
    // openai may claim up to 15 articles even though the corpus has 100
    // openai-themed ones — the cap prevents page-swallow.
    expect(openai!.totalArticlesInCluster).toBeLessThanOrEqual(15);
    // Storage cap is generous so the page can offer an "expand" affordance,
    // but still bounded.
    expect(openai!.articleIds.length).toBeLessThanOrEqual(30);
  });
});
