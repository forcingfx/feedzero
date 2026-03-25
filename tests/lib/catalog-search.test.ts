import { describe, it, expect, beforeAll } from "vitest";
import {
  buildSearchIndex,
  searchFeeds,
  type SearchableItem,
} from "@/lib/catalog-search.ts";
import type { CatalogCategory } from "@/lib/feed-catalog.ts";

const FEATURED: CatalogCategory[] = [
  {
    id: "news",
    name: "World News",
    description: "Major news sources",
    feeds: [
      {
        name: "BBC News",
        feedUrl: "https://feeds.bbci.co.uk/news/rss.xml",
        siteUrl: "https://www.bbc.co.uk",
        description: "Breaking news from BBC",
        tags: ["news"],
      },
    ],
  },
];

const CATALOG: import("@/lib/catalog-search.ts").GeneratedCatalog = {
  generatedAt: "2026-01-01",
  sourceUrl: "https://github.com/plenaryapp/awesome-rss-feeds",
  sections: [],
  countries: [
    {
      id: "uk",
      name: "United Kingdom",
      emoji: "🇬🇧",
      feeds: [
        {
          name: "The Guardian",
          feedUrl: "https://theguardian.com/rss",
          siteUrl: "https://theguardian.com",
          healthy: true,
        },
      ],
    },
  ],
  topics: [
    {
      id: "tech",
      name: "Tech",
      feeds: [
        {
          name: "Ars Technica",
          feedUrl: "https://feeds.arstechnica.com/index",
          siteUrl: "https://arstechnica.com",
          healthy: true,
        },
        {
          name: "The Verge",
          feedUrl: "https://theverge.com/rss",
          siteUrl: "https://theverge.com",
          healthy: true,
        },
      ],
    },
  ],
};

describe("buildSearchIndex", () => {
  it("includes all feeds from featured, topics, and countries", () => {
    const index = buildSearchIndex(FEATURED, CATALOG);

    expect(index).toHaveLength(4); // 1 featured + 1 country + 2 topic
  });

  it("tags items with correct categoryType", () => {
    const index = buildSearchIndex(FEATURED, CATALOG);

    const bbc = index.find((i) => i.name === "BBC News");
    expect(bbc?.categoryType).toBe("featured");

    const guardian = index.find((i) => i.name === "The Guardian");
    expect(guardian?.categoryType).toBe("country");

    const ars = index.find((i) => i.name === "Ars Technica");
    expect(ars?.categoryType).toBe("topic");
  });

  it("includes category name in each item", () => {
    const index = buildSearchIndex(FEATURED, CATALOG);

    const bbc = index.find((i) => i.name === "BBC News");
    expect(bbc?.category).toBe("World News");

    const guardian = index.find((i) => i.name === "The Guardian");
    expect(guardian?.category).toBe("United Kingdom");
  });

  it("pre-computes searchText as lowercase name + category", () => {
    const index = buildSearchIndex(FEATURED, CATALOG);

    const ars = index.find((i) => i.name === "Ars Technica");
    expect(ars?.searchText).toBe("ars technica tech");
  });

  it("filters out unhealthy feeds", () => {
    const catalogWithUnhealthy = {
      ...CATALOG,
      topics: [
        {
          id: "tech",
          name: "Tech",
          feeds: [
            {
              name: "Dead Feed",
              feedUrl: "https://dead.com/feed",
              siteUrl: "https://dead.com",
              healthy: false,
            },
            {
              name: "Alive Feed",
              feedUrl: "https://alive.com/feed",
              siteUrl: "https://alive.com",
              healthy: true,
            },
          ],
        },
      ],
    };

    const index = buildSearchIndex(FEATURED, catalogWithUnhealthy);
    expect(index.find((i) => i.name === "Dead Feed")).toBeUndefined();
    expect(index.find((i) => i.name === "Alive Feed")).toBeDefined();
  });
});

describe("searchFeeds", () => {
  let index: SearchableItem[];

  beforeAll(() => {
    index = buildSearchIndex(FEATURED, CATALOG);
  });

  it("returns all items for empty query", () => {
    const results = searchFeeds(index, "");
    expect(results).toHaveLength(index.length);
  });

  it("matches by feed name", () => {
    const results = searchFeeds(index, "ars");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Ars Technica");
  });

  it("matches by category name", () => {
    const results = searchFeeds(index, "tech");
    expect(results).toHaveLength(2); // Ars Technica + The Verge (both in Tech)
  });

  it("is case-insensitive", () => {
    const results = searchFeeds(index, "BBC");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("BBC News");
  });

  it("respects limit", () => {
    const results = searchFeeds(index, "", 2);
    expect(results).toHaveLength(2);
  });

  it("returns empty array for no matches", () => {
    const results = searchFeeds(index, "zzzznonexistent");
    expect(results).toHaveLength(0);
  });
});
