/**
 * Research CLI — pull a subreddit's posts and (crude) comments via Reddit's
 * `.rss` endpoints and write a Markdown export.
 *
 * Reddit serves an Atom feed for any URL with a `.rss` suffix, so this needs
 * no API key. It does rate-limit unauthenticated traffic hard and 403s
 * requests without a descriptive User-Agent, so the script sends one and
 * paces itself with a delay between requests.
 *
 * Comments are a flat, truncated slice (no threading, no scores) — that is
 * all `.rss` exposes. Full comment trees would need the OAuth API.
 *
 * Usage:
 *
 *   # Default: r/rss, 25 posts, ./reddit-rss-research.md
 *   npx tsx scripts/scrape-reddit.ts
 *
 *   # Pick the subreddit, post count, and output path
 *   npx tsx scripts/scrape-reddit.ts rss --limit 50 --out research/rss.md
 *
 *   # Skip comment fetching (posts only — one request total)
 *   npx tsx scripts/scrape-reddit.ts rss --no-comments
 *
 * NOTE: This must run somewhere with network access to reddit.com. The Claude
 * Code web sandbox blocks it via the outbound allowlist — run it locally.
 *
 * I/O shell only. The URL building, Atom parsing, and Markdown rendering live
 * in src/core/reddit/reddit-rss.ts (tested in isolation).
 */

import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import {
  subredditFeedUrl,
  commentsFeedUrl,
  parseSubredditFeed,
  parseCommentsFeed,
  renderResearchMarkdown,
  type RedditThread,
} from "../src/core/reddit/reddit-rss.ts";
import { isErr } from "../src/utils/result.ts";

declare const process: {
  argv: string[];
  exit(code?: number): never;
};

const DEFAULT_USER_AGENT =
  "feedzero-research/0.1 (RSS reader research export; +https://feedzero.app)";

function log(message: string): void {
  // Progress goes to stderr so stdout stays clean for piping.
  console.error(message);
}

async function fetchText(url: string, userAgent: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent, Accept: "application/atom+xml, text/xml" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      limit: { type: "string", default: "25" },
      out: { type: "string" },
      delay: { type: "string", default: "1500" },
      "user-agent": { type: "string", default: DEFAULT_USER_AGENT },
      "no-comments": { type: "boolean", default: false },
    },
  });

  const withComments = !values["no-comments"];

  const subreddit = (positionals[0] ?? "rss").replace(/^\/?r\//i, "");
  const limit = Number(values.limit);
  const delayMs = Number(values.delay);
  const userAgent = values["user-agent"] as string;
  const outPath = (values.out as string) ?? `reddit-${subreddit}-research.md`;

  const listingUrl = subredditFeedUrl(subreddit, limit);
  if (isErr(listingUrl)) {
    log(`Error: ${listingUrl.error}`);
    process.exit(1);
  }

  log(`Fetching posts: ${listingUrl.value}`);
  const listingXml = await fetchText(listingUrl.value, userAgent);
  const postsResult = parseSubredditFeed(listingXml);
  if (isErr(postsResult)) {
    log(`Error parsing subreddit feed: ${postsResult.error}`);
    process.exit(1);
  }
  const posts = postsResult.value;
  log(`Found ${posts.length} posts.`);

  const threads: RedditThread[] = [];
  for (const [index, post] of posts.entries()) {
    if (!withComments) {
      threads.push({ post, comments: [] });
      continue;
    }

    const commentsUrl = commentsFeedUrl(post.permalink);
    if (isErr(commentsUrl)) {
      log(`  [${index + 1}/${posts.length}] skipping comments: ${commentsUrl.error}`);
      threads.push({ post, comments: [] });
      continue;
    }

    await sleep(delayMs);
    log(`  [${index + 1}/${posts.length}] comments: ${commentsUrl.value}`);
    try {
      const commentsXml = await fetchText(commentsUrl.value, userAgent);
      const parsed = parseCommentsFeed(commentsXml);
      threads.push({ post, comments: isErr(parsed) ? [] : parsed.value });
      if (isErr(parsed)) log(`    parse failed: ${parsed.error}`);
    } catch (e) {
      log(`    fetch failed: ${(e as Error).message}`);
      threads.push({ post, comments: [] });
    }
  }

  const markdown = renderResearchMarkdown(subreddit, threads, Date.now());
  writeFileSync(outPath, markdown, "utf8");
  log(`Wrote ${threads.length} posts to ${outPath}`);
}

main().catch((e) => {
  log(`Fatal: ${(e as Error).message}`);
  process.exit(1);
});
