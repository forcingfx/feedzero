import { describe, it, expect } from "vitest";
import {
  parseAwesomeRssFeeds,
  parseNewsFeedList,
  mergeCountries,
} from "../../scripts/lib/readme-parser.ts";

const TOPIC_SECTION = `
### Tech
Title | RSS Feed Url | Domain
-------|------------------|----------
Ars Technica | http://feeds.arstechnica.com/arstechnica/index | arstechnica.com
CNET News | https://www.cnet.com/rss/news/ | cnet.com
The Verge | https://www.theverge.com/rss/index.xml | theverge.com
`;

const COUNTRY_SECTION = `
### 🇬🇧 United Kingdom
Source | Primary Feed Url | All Feeds
-------|------------------|----------
BBC News - Home | http://feeds.bbci.co.uk/news/rss.xml | https://www.bbc.com/news/10628494
The Guardian | https://www.theguardian.com/world/rss | https://www.theguardian.com/help/feeds
`;

const MIXED_MARKDOWN = `
# Awesome RSS Feeds

Some intro text.

## Recommended Sources

### 🇦🇺 Australia
Source | Primary Feed Url | All Feeds
-------|------------------|----------
Sydney Morning Herald | https://www.smh.com.au/rss/feed.xml | https://www.smh.com.au/rssheadlines

### 🇺🇸 United States
Source | Primary Feed Url | All Feeds
-------|------------------|----------
New York Times | https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml | https://www.nytimes.com

### Science
Title | RSS Feed Url | Domain
-------|------------------|----------
Nature | https://www.nature.com/nature.rss | nature.com
NASA | https://www.nasa.gov/news-release/feed/ | nasa.gov

### Programming
Title | RSS Feed Url | Domain
-------|------------------|----------
Hacker News | https://news.ycombinator.com/rss | news.ycombinator.com
`;

describe("parseAwesomeRssFeeds", () => {
  it("parses topic sections", () => {
    const result = parseAwesomeRssFeeds(TOPIC_SECTION);

    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].name).toBe("Tech");
    expect(result.topics[0].id).toBe("tech");
    expect(result.topics[0].feeds).toHaveLength(3);
    expect(result.topics[0].feeds[0]).toEqual({
      name: "Ars Technica",
      feedUrl: "http://feeds.arstechnica.com/arstechnica/index",
      siteUrl: "https://arstechnica.com",
      healthy: true,
    });
  });

  it("parses country sections with flag emoji", () => {
    const result = parseAwesomeRssFeeds(COUNTRY_SECTION);

    expect(result.countries).toHaveLength(1);
    expect(result.countries[0].name).toBe("United Kingdom");
    expect(result.countries[0].id).toBe("united-kingdom");
    expect(result.countries[0].emoji).toBe("🇬🇧");
    expect(result.countries[0].feeds).toHaveLength(2);
    expect(result.countries[0].feeds[0]).toEqual({
      name: "BBC News - Home",
      feedUrl: "http://feeds.bbci.co.uk/news/rss.xml",
      siteUrl: "https://www.bbc.com/news/10628494",
      healthy: true,
    });
  });

  it("separates countries and topics from mixed markdown", () => {
    const result = parseAwesomeRssFeeds(MIXED_MARKDOWN);

    expect(result.countries).toHaveLength(2);
    expect(result.countries.map((c) => c.name)).toEqual([
      "Australia",
      "United States",
    ]);

    expect(result.topics).toHaveLength(2);
    expect(result.topics.map((t) => t.name)).toEqual([
      "Science",
      "Programming",
    ]);
  });

  it("derives siteUrl from domain for topic feeds", () => {
    const result = parseAwesomeRssFeeds(TOPIC_SECTION);

    expect(result.topics[0].feeds[0].siteUrl).toBe(
      "https://arstechnica.com",
    );
    expect(result.topics[0].feeds[1].siteUrl).toBe("https://cnet.com");
  });

  it("uses All Feeds column as siteUrl for country feeds", () => {
    const result = parseAwesomeRssFeeds(COUNTRY_SECTION);

    expect(result.countries[0].feeds[0].siteUrl).toBe(
      "https://www.bbc.com/news/10628494",
    );
  });

  it("generates slug IDs from names", () => {
    const result = parseAwesomeRssFeeds(MIXED_MARKDOWN);

    expect(result.countries[0].id).toBe("australia");
    expect(result.countries[1].id).toBe("united-states");
    expect(result.topics[0].id).toBe("science");
    expect(result.topics[1].id).toBe("programming");
  });

  it("skips empty rows and malformed entries", () => {
    const markdown = `
### Tech
Title | RSS Feed Url | Domain
-------|------------------|----------
Valid Feed | https://example.com/feed | example.com
| | |
 | |
`;
    const result = parseAwesomeRssFeeds(markdown);

    expect(result.topics[0].feeds).toHaveLength(1);
    expect(result.topics[0].feeds[0].name).toBe("Valid Feed");
  });

  it("skips sections with no valid feeds", () => {
    const markdown = `
### Empty Section
Title | RSS Feed Url | Domain
-------|------------------|----------
`;
    const result = parseAwesomeRssFeeds(markdown);

    expect(result.topics).toHaveLength(0);
    expect(result.countries).toHaveLength(0);
  });

  it("trims whitespace from feed fields", () => {
    const markdown = `
### Tech
Title | RSS Feed Url | Domain
-------|------------------|----------
 Ars Technica  |  https://example.com/feed  |  example.com
`;
    const result = parseAwesomeRssFeeds(markdown);

    expect(result.topics[0].feeds[0].name).toBe("Ars Technica");
    expect(result.topics[0].feeds[0].feedUrl).toBe("https://example.com/feed");
  });

  it("includes generatedAt and sourceUrl metadata", () => {
    const result = parseAwesomeRssFeeds(TOPIC_SECTION);

    expect(result.generatedAt).toBeTruthy();
    expect(result.sourceUrl).toBe(
      "https://github.com/plenaryapp/awesome-rss-feeds",
    );
  });

  it("groups topics into newspaper-style sections", () => {
    const markdown = `
### Tech
Title | RSS Feed Url | Domain
-------|------------------|----------
Ars Technica | https://feeds.arstechnica.com/index | arstechnica.com

### Programming
Title | RSS Feed Url | Domain
-------|------------------|----------
Hacker News | https://news.ycombinator.com/rss | news.ycombinator.com

### Science
Title | RSS Feed Url | Domain
-------|------------------|----------
Nature | https://www.nature.com/nature.rss | nature.com

### Space
Title | RSS Feed Url | Domain
-------|------------------|----------
NASA | https://www.nasa.gov/feed/ | nasa.gov
`;
    const result = parseAwesomeRssFeeds(markdown);

    // Tech + Programming → Technology, Science + Space → Science & Space
    expect(result.sections).toHaveLength(2);

    const techSection = result.sections.find(
      (s) => s.name === "Technology",
    );
    expect(techSection).toBeDefined();
    expect(techSection!.emoji).toBe("💻");
    expect(techSection!.subcategories).toHaveLength(2);
    expect(techSection!.subcategories.map((s) => s.name)).toEqual([
      "Tech",
      "Programming",
    ]);

    const sciSection = result.sections.find(
      (s) => s.name === "Science & Space",
    );
    expect(sciSection).toBeDefined();
    expect(sciSection!.emoji).toBe("🔬");
  });
});

describe("parseNewsFeedList", () => {
  it("parses entries with check emoji", () => {
    const markdown = `
## Argentina
- ✅ [Clarin](https://www.clarin.com/) - [Feed](https://www.clarin.com/rss/lo-ultimo/)
- ✅ [La Nacion](https://www.lanacion.com.ar/) - [Feed](https://www.lanacion.com.ar/feed/)
- ❌ [Dead Feed](https://dead.com/) - [Feed](https://dead.com/rss)
`;
    const result = parseNewsFeedList(markdown);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Argentina");
    expect(result[0].id).toBe("argentina");
    // Only ✅ entries are parsed
    expect(result[0].feeds).toHaveLength(2);
    expect(result[0].feeds[0]).toEqual({
      name: "Clarin",
      feedUrl: "https://www.clarin.com/rss/lo-ultimo/",
      siteUrl: "https://www.clarin.com/",
      healthy: true,
    });
  });

  it("skips entries without check emoji", () => {
    const markdown = `
## TestCountry
- ❌ [Bad Feed](https://bad.com/) - [Feed](https://bad.com/rss)
- ⚠️ [Bot Protected](https://bot.com/) - [Feed](https://bot.com/rss)
`;
    const result = parseNewsFeedList(markdown);
    expect(result).toHaveLength(0);
  });
});

describe("mergeCountries", () => {
  it("merges countries from two sources, deduplicating by feed URL", () => {
    const primary = [
      {
        id: "argentina",
        name: "Argentina",
        emoji: "",
        feeds: [
          {
            name: "Clarin",
            feedUrl: "https://clarin.com/rss",
            siteUrl: "https://clarin.com",
            healthy: true,
          },
        ],
      },
    ];
    const secondary = [
      {
        id: "argentina",
        name: "Argentina",
        emoji: "🇦🇷",
        feeds: [
          {
            name: "Clarin",
            feedUrl: "https://clarin.com/rss",
            siteUrl: "https://clarin.com",
            healthy: true,
          },
          {
            name: "La Nacion",
            feedUrl: "https://lanacion.com.ar/feed",
            siteUrl: "https://lanacion.com.ar",
            healthy: true,
          },
        ],
      },
    ];

    const merged = mergeCountries(primary, secondary);

    expect(merged).toHaveLength(1);
    expect(merged[0].feeds).toHaveLength(2); // deduplicated
    expect(merged[0].emoji).toBe("🇦🇷"); // took secondary emoji
  });

  it("adds new countries from secondary", () => {
    const primary = [
      {
        id: "uk",
        name: "UK",
        emoji: "🇬🇧",
        feeds: [
          {
            name: "BBC",
            feedUrl: "https://bbc.co.uk/rss",
            siteUrl: "https://bbc.co.uk",
            healthy: true,
          },
        ],
      },
    ];
    const secondary = [
      {
        id: "japan",
        name: "Japan",
        emoji: "🇯🇵",
        feeds: [
          {
            name: "NHK",
            feedUrl: "https://nhk.or.jp/rss",
            siteUrl: "https://nhk.or.jp",
            healthy: true,
          },
        ],
      },
    ];

    const merged = mergeCountries(primary, secondary);

    expect(merged).toHaveLength(2);
    expect(merged.map((c) => c.name)).toEqual(["UK", "Japan"]);
  });
});
