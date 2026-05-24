import { describe, it, expect } from "vitest";
import {
  computeSignalScore,
  BRIEFING_MIN_SCORE,
  scoreBand,
} from "@/core/briefings/signal-score";
import type { Article } from "@feedzero/core/types";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function makeMatch(
  feedId: string,
  daysAgo: number,
  score = 1,
): { article: Article; score: number; matchedTerms: string[] } {
  const a: Article = {
    id: crypto.randomUUID(),
    feedId,
    guid: crypto.randomUUID(),
    title: "Article",
    link: "https://example.com/x",
    content: "",
    summary: "",
    author: "",
    publishedAt: NOW - daysAgo * DAY,
    read: false,
    createdAt: NOW - daysAgo * DAY,
  };
  return { article: a, score, matchedTerms: ["term"] };
}

describe("computeSignalScore", () => {
  it("returns 0 for no matches", () => {
    expect(computeSignalScore({ matches: [], now: NOW })).toBe(0);
  });

  it("returns a low score for a thin corpus (1 article, 1 feed)", () => {
    const score = computeSignalScore({
      matches: [makeMatch("feed-1", 1)],
      now: NOW,
    });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(BRIEFING_MIN_SCORE);
    expect(scoreBand(score)).toBe("weak");
  });

  it("anchor: 10 articles across 5 feeds, all recent → moderate band", () => {
    const matches = [];
    for (let feed = 0; feed < 5; feed++) {
      for (let i = 0; i < 2; i++) {
        matches.push(makeMatch(`feed-${feed}`, i + 1));
      }
    }
    const score = computeSignalScore({ matches, now: NOW });
    expect(score).toBeGreaterThanOrEqual(30);
    expect(score).toBeLessThan(70);
    expect(scoreBand(score)).toBe("moderate");
  });

  it("anchor: 30 articles across 10 feeds, all recent → strong band", () => {
    const matches = [];
    for (let feed = 0; feed < 10; feed++) {
      for (let i = 0; i < 3; i++) {
        matches.push(makeMatch(`feed-${feed}`, i + 1));
      }
    }
    const score = computeSignalScore({ matches, now: NOW });
    expect(score).toBeGreaterThanOrEqual(70);
    expect(scoreBand(score)).toBe("strong");
  });

  it("more feeds raise the score (cross-feed corroboration)", () => {
    const oneFeed = computeSignalScore({
      matches: [
        makeMatch("feed-1", 1),
        makeMatch("feed-1", 2),
        makeMatch("feed-1", 3),
        makeMatch("feed-1", 4),
      ],
      now: NOW,
    });
    const fourFeeds = computeSignalScore({
      matches: [
        makeMatch("feed-1", 1),
        makeMatch("feed-2", 2),
        makeMatch("feed-3", 3),
        makeMatch("feed-4", 4),
      ],
      now: NOW,
    });
    expect(fourFeeds).toBeGreaterThan(oneFeed);
  });

  it("recent matches outscore an equally-sized stale corpus", () => {
    const recent = computeSignalScore({
      matches: [
        makeMatch("feed-1", 1),
        makeMatch("feed-2", 2),
        makeMatch("feed-3", 3),
      ],
      now: NOW,
    });
    const stale = computeSignalScore({
      matches: [
        makeMatch("feed-1", 90),
        makeMatch("feed-2", 95),
        makeMatch("feed-3", 100),
      ],
      now: NOW,
    });
    expect(recent).toBeGreaterThan(stale);
  });

  it("never exceeds 100, never goes negative, returns an integer", () => {
    const matches = [];
    for (let feed = 0; feed < 50; feed++) {
      for (let i = 0; i < 10; i++) {
        matches.push(makeMatch(`feed-${feed}`, 1));
      }
    }
    const score = computeSignalScore({ matches, now: NOW });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(Number.isInteger(score)).toBe(true);
  });
});

describe("scoreBand", () => {
  it("labels 0–29 as weak, 30–69 as moderate, 70–100 as strong", () => {
    expect(scoreBand(0)).toBe("weak");
    expect(scoreBand(29)).toBe("weak");
    expect(scoreBand(30)).toBe("moderate");
    expect(scoreBand(69)).toBe("moderate");
    expect(scoreBand(70)).toBe("strong");
    expect(scoreBand(100)).toBe("strong");
  });
});

describe("BRIEFING_MIN_SCORE — the LLM-call gate", () => {
  it("is set so a 1-article / 1-feed corpus stays below the gate", () => {
    expect(BRIEFING_MIN_SCORE).toBeGreaterThanOrEqual(10);
    expect(BRIEFING_MIN_SCORE).toBeLessThanOrEqual(30);
  });
});
