import type { CatalogCategory } from "@/lib/feed-catalog.ts";

export interface CatalogSection {
  id: string;
  name: string;
  emoji: string;
  subcategories: CatalogTopic[];
}

export interface GeneratedCatalog {
  generatedAt: string;
  sourceUrl: string;
  countries: CatalogCountry[];
  topics: CatalogTopic[];
  sections: CatalogSection[];
}

export interface CatalogCountry {
  id: string;
  name: string;
  emoji: string;
  feeds: AwesomeFeed[];
}

export interface CatalogTopic {
  id: string;
  name: string;
  feeds: AwesomeFeed[];
}

export interface AwesomeFeed {
  name: string;
  feedUrl: string;
  siteUrl: string;
  healthy: boolean;
}

export interface SearchableItem {
  name: string;
  feedUrl: string;
  siteUrl: string;
  category: string;
  categoryType: "featured" | "topic" | "country";
  searchText: string;
}

function makeSearchText(name: string, category: string): string {
  return `${name} ${category}`.toLowerCase();
}

/** Builds a flat search index from featured categories and the generated catalog. */
export function buildSearchIndex(
  featured: CatalogCategory[],
  catalog: GeneratedCatalog,
): SearchableItem[] {
  const items: SearchableItem[] = [];

  for (const category of featured) {
    for (const feed of category.feeds) {
      items.push({
        name: feed.name,
        feedUrl: feed.feedUrl,
        siteUrl: feed.siteUrl,
        category: category.name,
        categoryType: "featured",
        searchText: makeSearchText(feed.name, category.name),
      });
    }
  }

  for (const country of catalog.countries) {
    for (const feed of country.feeds) {
      if (!feed.healthy) continue;
      items.push({
        name: feed.name,
        feedUrl: feed.feedUrl,
        siteUrl: feed.siteUrl,
        category: country.name,
        categoryType: "country",
        searchText: makeSearchText(feed.name, country.name),
      });
    }
  }

  for (const topic of catalog.topics) {
    for (const feed of topic.feeds) {
      if (!feed.healthy) continue;
      items.push({
        name: feed.name,
        feedUrl: feed.feedUrl,
        siteUrl: feed.siteUrl,
        category: topic.name,
        categoryType: "topic",
        searchText: makeSearchText(feed.name, topic.name),
      });
    }
  }

  return items;
}

/** Searches the index by substring match on pre-lowercased searchText. */
export function searchFeeds(
  index: SearchableItem[],
  query: string,
  limit?: number,
): SearchableItem[] {
  const q = query.toLowerCase().trim();
  const results = q ? index.filter((item) => item.searchText.includes(q)) : index;
  return limit ? results.slice(0, limit) : results;
}
