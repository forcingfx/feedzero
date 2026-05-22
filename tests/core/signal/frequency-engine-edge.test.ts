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
  it("never anchors a topic on a bare common noun", () => {
    const articles: Article[] = [];
    // 60 headlines whose only shared word is the common noun "tariffs",
    // which appears lowercase in bodies — so it must NOT form a topic.
    for (let i = 0; i < 60; i++) {
      articles.push(
        makeArticle(
          `a-${i}`,
          `f${(i % 6) + 1}`,
          `Tariffs shift trade number ${i}`,
          i % 6,
          `Analysts said tariffs would ripple as tariffs rose again number ${i}.`,
        ),
      );
    }
    const result = generateReport(articles, { feeds: FEEDS }, NOW);
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;
    const terms = result.value.topics.map((t) => t.term);
    expect(terms).not.toContain("tariff");
    expect(terms).not.toContain("tariffs");
  });

  it("collapses a syndicated story into one multi-outlet story, not a fake cluster", () => {
    const articles: Article[] = [];
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
    // "mayor" alone is a single deduped story across one normalized title —
    // it must not masquerade as a cross-feed topic.
    const mayorTopic = result.value.topics.find((t) => t.term === "mayor");
    expect(mayorTopic).toBeUndefined();
  });

  it("produces no topics when every entity lives in one feed", () => {
    const articles: Article[] = [];
    for (let i = 0; i < 60; i++) {
      articles.push(makeArticle(`a-${i}`, "f1", `Solo Subject ${i}`, i % 6));
    }
    const result = generateReport(articles, { feeds: FEEDS }, NOW);
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.topics).toEqual([]);
  });

  it("detects an entity that only appears in the article body", () => {
    const articles: Article[] = [];
    for (let i = 0; i < 60; i++) {
      articles.push(
        makeArticle(
          `a-${i}`,
          `f${(i % 6) + 1}`,
          `... ${i}`,
          i % 6,
          `Reports said OpenAI outpaced rivals as OpenAI expanded number ${i}.`,
        ),
      );
    }
    const result = generateReport(articles, { feeds: FEEDS }, NOW);
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.topics.map((t) => t.term)).toContain("openai");
  });

  it("is deterministic across two runs on the same input", () => {
    const articles: Article[] = [];
    for (let i = 0; i < 60; i++) {
      const cluster = i % 3;
      const word = cluster === 0 ? "OpenAI" : cluster === 1 ? "Tesla" : "Reuters";
      articles.push(makeArticle(`a-${i}`, `f${(i % 6) + 1}`, `${word} update number ${i}`, i % 6));
    }
    const first = generateReport(articles, { feeds: FEEDS }, NOW);
    const second = generateReport([...articles].reverse(), { feeds: FEEDS }, NOW);
    expect(isOk(first) && isOk(second)).toBe(true);
    if (!first.ok || !second.ok) return;
    const shape = (r: typeof first) =>
      r.ok
        ? r.value.topics.map((t) => ({
            term: t.term,
            stories: t.stories.map((s) => [...s.articleIds]),
          }))
        : null;
    expect(shape(second)).toEqual(shape(first));
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

  it("respects the per-topic claim cap so a dominant entity cannot swallow the corpus", () => {
    const articles: Article[] = [];
    for (let i = 0; i < 100; i++) {
      articles.push(
        makeArticle(`a-${i}`, `f${(i % 6) + 1}`, `OpenAI ships product number ${i}`, i % 5),
      );
    }
    const result = generateReport(articles, { feeds: FEEDS }, NOW);
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;
    const openai = result.value.topics.find((t) => t.term === "openai");
    expect(openai).toBeDefined();
    // Cap = ceil(N/SIGNAL_TOPIC_TARGET) + 5 with N=100 → 15 representatives.
    expect(openai!.totalStories).toBeLessThanOrEqual(15);
    expect(openai!.stories.length).toBeLessThanOrEqual(30);
  });
});
