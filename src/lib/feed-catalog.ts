import type { Feed } from "@feedzero/core/types";

export interface CatalogFeed {
  name: string;
  feedUrl: string;
  siteUrl: string;
  description: string;
  tags: string[];
}

export interface CatalogCategory {
  id: string;
  name: string;
  description: string;
  feeds: CatalogFeed[];
}

const normalizeTrailingSlash = (url: string) => url.replace(/\/+$/, "");

/** Checks whether a catalog feed URL matches any subscribed feed, normalizing trailing slashes. */
export function isSubscribed(catalogFeedUrl: string, subscribedFeeds: Feed[]): boolean {
  const normalized = normalizeTrailingSlash(catalogFeedUrl);
  return subscribedFeeds.some((f) => normalizeTrailingSlash(f.url) === normalized);
}

/** Finds the subscribed feed that matches a catalog feed URL. Returns undefined if not subscribed. */
export function findSubscribedFeed(catalogFeedUrl: string, subscribedFeeds: Feed[]): Feed | undefined {
  const normalized = normalizeTrailingSlash(catalogFeedUrl);
  return subscribedFeeds.find((f) => normalizeTrailingSlash(f.url) === normalized);
}

export const feedCatalog: CatalogCategory[] = [
  {
    id: "news",
    name: "World News",
    description: "Major global news sources covering international affairs",
    feeds: [
      {
        name: "BBC News",
        feedUrl: "https://feeds.bbci.co.uk/news/rss.xml",
        siteUrl: "https://www.bbc.co.uk/news",
        description: "Breaking news and analysis from the BBC",
        tags: ["news", "uk"],
      },
      {
        name: "New York Times",
        feedUrl: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
        siteUrl: "https://www.nytimes.com",
        description: "Top stories and in-depth reporting from the NYT",
        tags: ["news", "us"],
      },
      {
        name: "The Guardian",
        feedUrl: "https://www.theguardian.com/world/rss",
        siteUrl: "https://www.theguardian.com",
        description: "World news and investigative journalism",
        tags: ["news", "uk"],
      },
      {
        name: "NPR",
        feedUrl: "https://feeds.npr.org/1001/rss.xml",
        siteUrl: "https://www.npr.org",
        description: "National and international news from NPR",
        tags: ["news", "us"],
      },
      {
        name: "Al Jazeera",
        feedUrl: "https://www.aljazeera.com/xml/rss/all.xml",
        siteUrl: "https://www.aljazeera.com",
        description: "Global news with perspectives from the Middle East",
        tags: ["news", "international"],
      },
    ],
  },
  {
    id: "tech",
    name: "Tech & Blogs",
    description: "Technology news and independent voices on the web",
    feeds: [
      {
        name: "Daring Fireball",
        feedUrl: "https://daringfireball.net/feeds/main",
        siteUrl: "https://daringfireball.net",
        description: "John Gruber on Apple, technology, and culture",
        tags: ["tech", "apple", "blog"],
      },
      {
        name: "Ars Technica",
        feedUrl: "https://feeds.arstechnica.com/arstechnica/index",
        siteUrl: "https://arstechnica.com",
        description: "In-depth technology news and analysis",
        tags: ["tech", "science"],
      },
      {
        name: "The Verge",
        feedUrl: "https://www.theverge.com/rss/index.xml",
        siteUrl: "https://www.theverge.com",
        description: "Technology, science, art, and culture coverage",
        tags: ["tech", "culture"],
      },
      {
        name: "TechCrunch",
        feedUrl: "https://techcrunch.com/feed/",
        siteUrl: "https://techcrunch.com",
        description: "Startup and technology industry news",
        tags: ["tech", "startups"],
      },
      {
        name: "kottke.org",
        feedUrl: "https://kottke.org/feeds/main",
        siteUrl: "https://kottke.org",
        description: "One of the oldest blogs on the web — eclectic curation",
        tags: ["blog", "culture"],
      },
    ],
  },
  {
    id: "science",
    name: "Science & Nature",
    description: "Scientific research, discoveries, and the natural world",
    feeds: [
      {
        name: "Nature",
        feedUrl: "https://www.nature.com/nature.rss",
        siteUrl: "https://www.nature.com",
        description: "Leading international journal of science",
        tags: ["science", "research"],
      },
      {
        name: "Quanta Magazine",
        feedUrl: "https://api.quantamagazine.org/feed/",
        siteUrl: "https://www.quantamagazine.org",
        description: "Mathematics, physics, biology, and computer science",
        tags: ["science", "math"],
      },
      {
        name: "NASA Breaking News",
        feedUrl: "https://www.nasa.gov/news-release/feed/",
        siteUrl: "https://www.nasa.gov",
        description: "Space exploration news and mission updates",
        tags: ["space", "science"],
      },
    ],
  },
  {
    id: "independent",
    name: "Independent Voices",
    description: "Independent writers, journalists, and thinkers",
    feeds: [
      {
        name: "Stratechery",
        feedUrl: "https://stratechery.com/feed/",
        siteUrl: "https://stratechery.com",
        description: "Ben Thompson on technology and business strategy",
        tags: ["tech", "business", "blog"],
      },
      {
        name: "Seth Godin",
        feedUrl: "https://seths.blog/feed/",
        siteUrl: "https://seths.blog",
        description: "Daily insights on marketing, leadership, and change",
        tags: ["marketing", "blog"],
      },
      {
        name: "Brain Pickings",
        feedUrl: "https://feeds.feedburner.com/brainpickings/rss",
        siteUrl: "https://www.themarginalian.org",
        description: "Literature, science, art, and philosophy",
        tags: ["culture", "philosophy", "blog"],
      },
    ],
  },
];
