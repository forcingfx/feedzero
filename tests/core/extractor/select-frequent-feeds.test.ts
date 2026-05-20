/**
 * selectFrequentFeeds is a pure selector — it answers "which feeds
 * has the user read N or more articles from in the last 30 days?"
 * No I/O, no store, just an Article[] → feedId[] transform that
 * drives the auto-prefetch heuristic without requiring the user to
 * flip the explicit per-feed toggle.
 */

import { describe, it, expect } from "vitest";
import {
  selectFrequentFeeds,
  FREQUENCY_THRESHOLD,
  FREQUENCY_WINDOW_MS,
} from "../../../src/core/extractor/prefetch-service.ts";
import type { Article } from "../../../src/types/index.ts";

function article(
  id: string,
  feedId: string,
  readAt: number | undefined,
): Article {
  return {
    id,
    feedId,
    guid: id,
    title: id,
    link: "",
    content: "",
    summary: "",
    author: "",
    publishedAt: 0,
    read: readAt !== undefined,
    createdAt: 0,
    readAt,
  };
}

describe("selectFrequentFeeds", () => {
  const now = 1_700_000_000_000;
  const recent = now - 1_000;
  const ancient = now - FREQUENCY_WINDOW_MS - 1;

  it("returns no feeds when nothing has been read recently", () => {
    expect(selectFrequentFeeds([], now)).toEqual([]);
  });

  it("includes a feed once the user has read >= THRESHOLD articles within the window", () => {
    const articles: Article[] = [];
    for (let i = 0; i < FREQUENCY_THRESHOLD; i++) {
      articles.push(article(`a${i}`, "f-hot", recent));
    }
    expect(selectFrequentFeeds(articles, now)).toEqual(["f-hot"]);
  });

  it("excludes a feed below the threshold", () => {
    const articles: Article[] = [];
    for (let i = 0; i < FREQUENCY_THRESHOLD - 1; i++) {
      articles.push(article(`a${i}`, "f-tepid", recent));
    }
    expect(selectFrequentFeeds(articles, now)).toEqual([]);
  });

  it("ignores reads older than the window", () => {
    const articles: Article[] = [];
    for (let i = 0; i < FREQUENCY_THRESHOLD + 5; i++) {
      articles.push(article(`a${i}`, "f-cold", ancient));
    }
    expect(selectFrequentFeeds(articles, now)).toEqual([]);
  });

  it("treats unread articles (no readAt) as not contributing", () => {
    const articles: Article[] = [];
    for (let i = 0; i < FREQUENCY_THRESHOLD; i++) {
      articles.push(article(`a${i}`, "f-unread", undefined));
    }
    expect(selectFrequentFeeds(articles, now)).toEqual([]);
  });

  it("counts only recent reads per feed; mixes are handled correctly", () => {
    const articles: Article[] = [];
    for (let i = 0; i < FREQUENCY_THRESHOLD; i++) {
      articles.push(article(`hot-${i}`, "f-hot", recent));
    }
    for (let i = 0; i < FREQUENCY_THRESHOLD; i++) {
      articles.push(article(`stale-${i}`, "f-stale", ancient));
    }
    for (let i = 0; i < 2; i++) {
      articles.push(article(`tepid-${i}`, "f-tepid", recent));
    }
    expect(selectFrequentFeeds(articles, now)).toEqual(["f-hot"]);
  });
});
