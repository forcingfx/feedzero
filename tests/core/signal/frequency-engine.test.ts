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

describe("generateReport — happy path", () => {
  const feeds: Feed[] = Array.from({ length: 8 }, (_, i) => makeFeed(`f${i + 1}`));

  // "OpenAI" is a proper noun (only ever capitalized). The objects are
  // lowercase so no competing entity forms within the cluster.
  const OPENAI_VARIANTS = [
    "OpenAI ships a release",
    "OpenAI hires a team",
    "OpenAI cuts api prices",
    "OpenAI faces a lawsuit",
    "OpenAI updates safety policy",
    "OpenAI hosts a developer event",
    "OpenAI buys a hardware startup",
    "OpenAI rolls back a feature",
    "OpenAI funds a research grant",
    "OpenAI revenue beats forecast",
    "OpenAI faces regulatory scrutiny",
    "OpenAI expands cloud capacity",
  ];
  // "Supreme Court" is a compound (Court recurs capitalized mid-headline).
  const COURT_VARIANTS = [
    "Supreme Court rules on a case",
    "Supreme Court hears arguments",
    "Supreme Court weighs a challenge",
    "Supreme Court issues an opinion",
    "Supreme Court delays a decision",
    "Supreme Court reviews a petition",
    "Supreme Court splits on a ruling",
    "Supreme Court declines a case",
  ];

  const articles: Article[] = [];
  OPENAI_VARIANTS.forEach((title, i) => {
    articles.push(makeArticle(`a-openai-${i}`, `f${(i % 6) + 1}`, title, 1 + (i % 5)));
  });
  // One OpenAI story syndicated verbatim across three outlets.
  ["f1", "f2", "f3"].forEach((feedId, i) => {
    articles.push(makeArticle(`a-openai-syn-${i}`, feedId, "OpenAI launches atlas browser", 2));
  });
  COURT_VARIANTS.forEach((title, i) => {
    articles.push(makeArticle(`a-court-${i}`, `f${(i % 5) + 1}`, title, 1 + (i % 4)));
  });
  // Long tail: single-feed chatter that shouldn't form cross-feed clusters.
  for (let i = 0; i < 30; i++) {
    articles.push(makeArticle(`a-noise-${i}`, "f8", `Singleton subject ${i}`, 2));
  }

  const result = generateReport(articles, { feeds }, NOW);

  it("anchors topics on proper nouns and compound nouns", () => {
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;
    const terms = result.value.topics.map((t) => t.term);
    expect(terms).toContain("openai");
    expect(terms).toContain("supreme court");
  });

  it("orders topics by signal strength (OpenAI is loudest)", () => {
    if (!result.ok) return;
    expect(result.value.topics[0].term).toBe("openai");
  });

  it("prefers the compound over its constituents", () => {
    if (!result.ok) return;
    const terms = result.value.topics.map((t) => t.term);
    expect(terms).not.toContain("supreme");
    expect(terms).not.toContain("court");
  });

  it("produces at most SIGNAL_TOPIC_TARGET topics", () => {
    if (!result.ok) return;
    expect(result.value.topics.length).toBeLessThanOrEqual(10);
  });

  it("drops single-feed-only terms (the noise feed)", () => {
    if (!result.ok) return;
    for (const topic of result.value.topics) {
      expect(topic.feedCount).toBeGreaterThan(1);
    }
  });

  it("surfaces a multi-outlet story with its outlet count", () => {
    if (!result.ok) return;
    const openai = result.value.topics.find((t) => t.term === "openai");
    const multi = openai?.stories.find((s) => s.feedCount >= 2);
    expect(multi).toBeDefined();
    expect(multi!.articleIds.length).toBeGreaterThanOrEqual(2);
  });

  it("topics are disjoint — no article appears in two topics", () => {
    if (!result.ok) return;
    const seen = new Set<string>();
    for (const topic of result.value.topics) {
      for (const story of topic.stories) {
        for (const id of story.articleIds) {
          expect(seen.has(id)).toBe(false);
          seen.add(id);
        }
      }
    }
  });

  it("displayTerm preserves the most common original casing", () => {
    if (!result.ok) return;
    const openai = result.value.topics.find((t) => t.term === "openai");
    expect(openai?.displayTerm).toBe("OpenAI");
    const court = result.value.topics.find((t) => t.term === "supreme court");
    expect(court?.displayTerm).toBe("Supreme Court");
  });

  it("reports schema version, corpus stats and chosen window", () => {
    if (!result.ok) return;
    expect(result.value.schemaVersion).toBe(2);
    expect(result.value.corpusSize).toBe(articles.length);
    expect(result.value.corpusInWindow).toBeGreaterThan(0);
    expect(result.value.window).toBe("7d");
    expect(result.value.feedsInWindow).toBeGreaterThan(0);
    expect(result.value.generatedAt).toBe(NOW);
  });
});
