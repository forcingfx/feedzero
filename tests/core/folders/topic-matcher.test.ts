import { describe, it, expect } from "vitest";
import {
  matchFeedsToTopics,
  DEFAULT_TAXONOMY,
  type Topic,
} from "@/core/folders/topic-matcher";
import type { Feed, Article } from "@feedzero/core/types";

function makeFeed(overrides: Partial<Feed> & { id: string }): Feed {
  return {
    url: `https://example.com/${overrides.id}.xml`,
    title: "",
    description: "",
    siteUrl: `https://example.com/${overrides.id}`,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeArticle(feedId: string, title: string): Article {
  return {
    id: `${feedId}-${title}`,
    feedId,
    guid: `${feedId}-${title}`,
    title,
    link: `https://example.com/${title}`,
    content: "",
    summary: "",
    author: "",
    publishedAt: 0,
    read: false,
    createdAt: 0,
  };
}

describe("matchFeedsToTopics", () => {
  it("matches a tech feed to the Tech topic via the title", () => {
    const feeds = [
      makeFeed({ id: "f1", title: "Hacker News", description: "" }),
    ];
    const result = matchFeedsToTopics(feeds, {}, DEFAULT_TAXONOMY);
    expect(result.get("f1")).toBe("tech");
  });

  it("matches a science feed via the description", () => {
    const feeds = [
      makeFeed({
        id: "f1",
        title: "Quanta",
        description:
          "Long-form journalism about physics, biology, and quantum research.",
      }),
    ];
    const result = matchFeedsToTopics(feeds, {}, DEFAULT_TAXONOMY);
    expect(result.get("f1")).toBe("science");
  });

  it("matches via recent article titles when feed metadata is sparse", () => {
    const feeds = [makeFeed({ id: "f1", title: "Daily Thread" })];
    const articlesByFeedId: Record<string, Article[]> = {
      f1: [
        makeArticle("f1", "Premier League roundup: weekend football scores"),
        makeArticle("f1", "Champions League quarter-final preview"),
        makeArticle("f1", "Tennis: Wimbledon draw announced"),
      ],
    };
    const result = matchFeedsToTopics(feeds, articlesByFeedId, DEFAULT_TAXONOMY);
    expect(result.get("f1")).toBe("sports");
  });

  it("returns 'uncategorized' when no topic scores above the threshold", () => {
    const feeds = [
      makeFeed({
        id: "f1",
        title: "My Personal Blog",
        description: "Random thoughts.",
      }),
    ];
    const result = matchFeedsToTopics(feeds, {}, DEFAULT_TAXONOMY);
    expect(result.get("f1")).toBe("uncategorized");
  });

  it("ranks topics by total keyword hit weight, not by first match", () => {
    // Feed mentions one tech word but five business/finance words —
    // the matcher must pick business, not tech.
    const feeds = [
      makeFeed({
        id: "f1",
        title: "Bloomberg",
        description:
          "Business, finance, market, economic and startup news with occasional dev coverage.",
      }),
    ];
    const result = matchFeedsToTopics(feeds, {}, DEFAULT_TAXONOMY);
    expect(result.get("f1")).toBe("business");
  });

  it("respects a custom taxonomy that the user provides", () => {
    const custom: Topic[] = [
      {
        id: "homelab",
        name: "Homelab",
        keywords: ["homelab", "kubernetes", "selfhost", "docker"],
      },
      {
        id: "garden",
        name: "Garden",
        keywords: ["garden", "plant", "seed", "compost"],
      },
    ];
    const feeds = [
      makeFeed({
        id: "f1",
        title: "Selfhosted",
        description: "Docker and Kubernetes guides for homelab tinkerers.",
      }),
      makeFeed({
        id: "f2",
        title: "Garden Notes",
        description: "Compost, seeds, perennials.",
      }),
    ];
    const result = matchFeedsToTopics(feeds, {}, custom);
    expect(result.get("f1")).toBe("homelab");
    expect(result.get("f2")).toBe("garden");
  });

  it("is case-insensitive and handles punctuation", () => {
    const feeds = [
      makeFeed({
        id: "f1",
        title: "TECH-CRUNCH",
        description: "Software, AI, & Programming.",
      }),
    ];
    const result = matchFeedsToTopics(feeds, {}, DEFAULT_TAXONOMY);
    expect(result.get("f1")).toBe("tech");
  });

  it("does not match substrings of unrelated words", () => {
    // The 'art' keyword (under Culture) must not fire on 'startup' or 'partner'.
    const feeds = [
      makeFeed({
        id: "f1",
        title: "Startup Weekly",
        description: "Founder partner stories and investor updates.",
      }),
    ];
    const result = matchFeedsToTopics(feeds, {}, DEFAULT_TAXONOMY);
    expect(result.get("f1")).not.toBe("culture");
  });

  it("returns a result for every input feed", () => {
    const feeds = [
      makeFeed({ id: "f1", title: "Hacker News" }),
      makeFeed({ id: "f2", title: "Bloomberg" }),
      makeFeed({ id: "f3", title: "My Diary" }),
    ];
    const result = matchFeedsToTopics(feeds, {}, DEFAULT_TAXONOMY);
    expect(result.size).toBe(3);
    expect(result.has("f1")).toBe(true);
    expect(result.has("f2")).toBe(true);
    expect(result.has("f3")).toBe(true);
  });
});

describe("DEFAULT_TAXONOMY", () => {
  it("has unique topic IDs", () => {
    const ids = DEFAULT_TAXONOMY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has at least 6 topics covering common domains", () => {
    expect(DEFAULT_TAXONOMY.length).toBeGreaterThanOrEqual(6);
    const ids = DEFAULT_TAXONOMY.map((t) => t.id);
    expect(ids).toContain("tech");
    expect(ids).toContain("news");
    expect(ids).toContain("business");
    expect(ids).toContain("science");
  });

  it("every topic has a non-empty keywords array", () => {
    for (const topic of DEFAULT_TAXONOMY) {
      expect(topic.keywords.length).toBeGreaterThan(0);
      expect(topic.name.trim().length).toBeGreaterThan(0);
    }
  });
});
