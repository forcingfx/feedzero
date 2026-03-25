import type { ParsedFeed } from "./readme-parser.ts";

/** Checks if a single feed URL is reachable via HTTP HEAD. */
export async function checkFeedHealth(
  url: string,
  timeoutMs = 3000,
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.status < 400;
  } catch {
    return false;
  }
}

/** Checks all feeds with bounded concurrency. Returns a map of feedUrl → healthy. */
export async function checkAllFeeds(
  feeds: ParsedFeed[],
  concurrency = 10,
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  let index = 0;

  async function worker() {
    while (index < feeds.length) {
      const current = index++;
      const feed = feeds[current];
      const healthy = await checkFeedHealth(feed.feedUrl);
      results.set(feed.feedUrl, healthy);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, feeds.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return results;
}
