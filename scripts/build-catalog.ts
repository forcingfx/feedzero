import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseAwesomeRssFeeds,
  parseNewsFeedList,
  mergeCountries,
} from "./lib/readme-parser.ts";
import { checkAllFeeds } from "./lib/health-checker.ts";
import type { ParsedFeed } from "./lib/readme-parser.ts";

const AWESOME_RSS_URL =
  "https://raw.githubusercontent.com/plenaryapp/awesome-rss-feeds/master/README.md";
const NEWS_FEED_LIST_URL =
  "https://raw.githubusercontent.com/yavuz/news-feed-list-of-countries/master/README.md";
const OUTPUT_PATH = resolve(
  import.meta.dirname,
  "../src/data/feed-catalog.generated.json",
);

const shouldCheck = process.argv.includes("--check");

async function fetchMarkdown(url: string, label: string): Promise<string> {
  console.log(`Fetching ${label}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${label}: ${response.status}`);
  }
  return response.text();
}

async function main() {
  const [awesomeMd, newsFeedMd] = await Promise.all([
    fetchMarkdown(AWESOME_RSS_URL, "awesome-rss-feeds"),
    fetchMarkdown(NEWS_FEED_LIST_URL, "news-feed-list-of-countries"),
  ]);

  console.log("Parsing awesome-rss-feeds...");
  const catalog = parseAwesomeRssFeeds(awesomeMd);

  console.log("Parsing news-feed-list-of-countries...");
  const newsFeedCountries = parseNewsFeedList(newsFeedMd);
  console.log(
    `  Parsed ${newsFeedCountries.length} countries from news-feed-list`,
  );

  console.log("Merging countries...");
  catalog.countries = mergeCountries(newsFeedCountries, catalog.countries);

  const countryFeedCount = catalog.countries.reduce(
    (sum, c) => sum + c.feeds.length,
    0,
  );
  const topicFeedCount = catalog.topics.reduce(
    (sum, t) => sum + t.feeds.length,
    0,
  );
  const sectionCount = catalog.sections.length;
  console.log(
    `Total: ${countryFeedCount + topicFeedCount} feeds ` +
      `(${catalog.countries.length} countries, ${catalog.topics.length} topics in ${sectionCount} sections)`,
  );

  if (shouldCheck) {
    console.log("Health-checking feeds (this may take a few minutes)...");
    const allFeeds: ParsedFeed[] = [
      ...catalog.countries.flatMap((c) => c.feeds),
      ...catalog.topics.flatMap((t) => t.feeds),
    ];
    const healthMap = await checkAllFeeds(allFeeds);

    let unhealthyCount = 0;
    for (const country of catalog.countries) {
      for (const feed of country.feeds) {
        feed.healthy = healthMap.get(feed.feedUrl) ?? true;
        if (!feed.healthy) unhealthyCount++;
      }
    }
    for (const topic of catalog.topics) {
      for (const feed of topic.feeds) {
        feed.healthy = healthMap.get(feed.feedUrl) ?? true;
        if (!feed.healthy) unhealthyCount++;
      }
    }
    console.log(
      `Health check: ${unhealthyCount} unhealthy of ${allFeeds.length}`,
    );
  }

  mkdirSync(resolve(import.meta.dirname, "../src/data"), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(catalog, null, 2) + "\n");
  console.log(`Written to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
