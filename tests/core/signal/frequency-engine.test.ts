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
  // 8 feeds, 60 articles across two dominant topics ("openai" and "tariffs"),
  // plus a third smaller topic ("election") and a long tail of single-feed
  // chatter that should be discarded.
  const feeds: Feed[] = Array.from({ length: 8 }, (_, i) => makeFeed(`f${i + 1}`));

  // Each headline carries one distinctive proper noun plus filler so the
  // cluster anchor is unambiguous. Real headlines vary more than this, but
  // the fixture's job is to assert ordering, not realism.
  const OPENAI_VARIANTS = [
    "OpenAI ships GPT release",
    "OpenAI hires research team",
    "OpenAI partners with Microsoft",
    "OpenAI cuts API prices",
    "OpenAI faces lawsuit",
    "OpenAI opens Tokyo office",
    "OpenAI updates safety policy",
    "OpenAI hosts developer event",
    "OpenAI buys hardware startup",
    "OpenAI launches Atlas browser",
    "OpenAI rolls back feature",
    "OpenAI funds research grant",
    "OpenAI revenue beats forecast",
    "OpenAI faces regulatory scrutiny",
  ];
  const TARIFF_VARIANTS = [
    "Tariffs jolt global markets",
    "Tariffs spark trade debate",
    "Tariffs hit consumer prices",
    "Tariffs reshape supply chains",
    "Tariffs draw EU response",
    "Tariffs prompt factory closures",
    "Tariffs target electric vehicles",
    "Tariffs squeeze farm exports",
    "Tariffs raise inflation worry",
    "Tariffs trigger retaliation threat",
    "Tariffs dent corporate guidance",
    "Tariffs widen budget gap",
  ];
  const ELECTION_VARIANTS = [
    "Election polls swing late",
    "Election ground game intensifies",
    "Election fundraising sets record",
    "Election turnout exceeds forecast",
    "Election results delayed by recount",
    "Election security upgraded statewide",
    "Election debate reshuffles race",
    "Election ad spending surges",
    "Election workers report calm day",
  ];

  const articles: Article[] = [];
  OPENAI_VARIANTS.forEach((title, i) => {
    articles.push(makeArticle(`a-openai-${i}`, `f${(i % 6) + 1}`, title, 1 + (i % 5)));
  });
  TARIFF_VARIANTS.forEach((title, i) => {
    articles.push(makeArticle(`a-tariff-${i}`, `f${(i % 5) + 1}`, title, 1 + (i % 4)));
  });
  ELECTION_VARIANTS.forEach((title, i) => {
    articles.push(makeArticle(`a-elect-${i}`, `f${(i % 4) + 1}`, title, 2 + (i % 3)));
  });
  // Long tail: single-feed chatter that shouldn't form cross-feed clusters.
  for (let i = 0; i < 25; i++) {
    articles.push(makeArticle(`a-noise-${i}`, "f8", `Singleton subject ${i}`, 2));
  }

  const result = generateReport(articles, { feeds }, NOW);

  it("returns ok with topics ordered by signal strength", () => {
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;
    const terms = result.value.topics.map((t) => t.term);
    expect(terms[0]).toBe("openai");
    expect(terms[1]).toBe("tariff");
    expect(terms[2]).toBe("election");
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

  it("topics are disjoint — no article appears in two topics", () => {
    if (!result.ok) return;
    const seen = new Set<string>();
    for (const topic of result.value.topics) {
      for (const id of topic.articleIds) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  });

  it("intra-topic article order is most-recent first", () => {
    if (!result.ok) return;
    const byId = new Map(articles.map((a) => [a.id, a]));
    for (const topic of result.value.topics) {
      const times = topic.articleIds.map((id) => byId.get(id)!.publishedAt);
      for (let i = 1; i < times.length; i++) {
        expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
      }
    }
  });

  it("displayTerm preserves the most common original casing", () => {
    if (!result.ok) return;
    const openai = result.value.topics.find((t) => t.term === "openai");
    expect(openai?.displayTerm).toBe("OpenAI");
  });

  it("reports corpus stats and chosen window", () => {
    if (!result.ok) return;
    expect(result.value.corpusSize).toBe(articles.length);
    expect(result.value.corpusInWindow).toBeGreaterThan(0);
    expect(result.value.window).toBe("7d");
    expect(result.value.feedsInWindow).toBeGreaterThan(0);
    expect(result.value.generatedAt).toBe(NOW);
  });
});
