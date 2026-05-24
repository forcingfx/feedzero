import { describe, it, expect } from "vitest";
import { matchArticles } from "@/core/briefings/prompt-matcher";
import type { Article } from "@feedzero/core/types";

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    feedId: overrides.feedId ?? "feed-1",
    guid: overrides.guid ?? crypto.randomUUID(),
    title: overrides.title ?? "",
    link: overrides.link ?? "https://example.com/x",
    content: overrides.content ?? "",
    summary: overrides.summary ?? "",
    author: overrides.author ?? "",
    publishedAt: overrides.publishedAt ?? 1_700_000_000_000,
    read: overrides.read ?? false,
    createdAt: overrides.createdAt ?? 1_700_000_000_000,
    ...overrides,
  };
}

describe("matchArticles — IDF-weighted prompt matcher", () => {
  it("returns an empty array when the prompt has no tokenizable terms", () => {
    const result = matchArticles("   ", [article({ title: "Some article" })]);
    expect(result).toEqual([]);
  });

  it("returns an empty array when no articles match", () => {
    const result = matchArticles("blockchain ethereum", [
      article({ title: "Bird watching weekly" }),
      article({ title: "Local cafe reopens" }),
    ]);
    expect(result).toEqual([]);
  });

  it("returns matching articles ranked by IDF-weighted score", () => {
    // "regulation" appears in 1 article (high IDF); "europe" appears in 2 (lower IDF).
    // Article A: hits both "regulation" + "europe" → highest score.
    // Article B: hits "europe" only → next.
    // Article C: hits neither → excluded.
    const a = article({ id: "a", title: "EU regulation reshapes Europe" });
    const b = article({ id: "b", title: "Europe summer travel guide" });
    const c = article({ id: "c", title: "Sourdough baking tips" });

    const result = matchArticles("europe regulation", [a, b, c]);
    expect(result).toHaveLength(2);
    expect(result[0].article.id).toBe("a");
    expect(result[1].article.id).toBe("b");
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("includes the matched terms on each result for UI inspection", () => {
    const a = article({ id: "a", title: "AI Act enforcement begins" });
    const result = matchArticles("ai enforcement", [a]);
    expect(result).toHaveLength(1);
    expect(result[0].matchedTerms.sort()).toEqual(["ai", "enforcement"].sort());
  });

  it("matches against title, summary, and content", () => {
    const titleHit = article({ id: "t", title: "Privacy ruling", summary: "" });
    const summaryHit = article({
      id: "s",
      title: "Weather forecast",
      summary: "A landmark privacy ruling lands today.",
    });
    const contentHit = article({
      id: "c",
      title: "Weather forecast",
      summary: "",
      content: "<p>Reuters reports a landmark privacy ruling.</p>",
    });

    const result = matchArticles("privacy", [titleHit, summaryHit, contentHit]);
    const ids = result.map((m) => m.article.id).sort();
    expect(ids).toEqual(["c", "s", "t"]);
  });

  it("breaks score ties by recency (newer first)", () => {
    const older = article({
      id: "older",
      title: "Acme launches",
      publishedAt: 1_000,
    });
    const newer = article({
      id: "newer",
      title: "Acme launches",
      publishedAt: 2_000,
    });
    const result = matchArticles("acme", [older, newer]);
    expect(result.map((m) => m.article.id)).toEqual(["newer", "older"]);
  });

  it("caps the result count at topK (default 30)", () => {
    const articles = Array.from({ length: 50 }, (_, i) =>
      article({ id: String(i), title: "Climate climate climate" }),
    );
    const result = matchArticles("climate", articles);
    expect(result).toHaveLength(30);
  });

  it("respects an explicit topK option", () => {
    const articles = Array.from({ length: 10 }, (_, i) =>
      article({ id: String(i), title: "Trade trade" }),
    );
    const result = matchArticles("trade", articles, { topK: 5 });
    expect(result).toHaveLength(5);
  });

  it("respects minMatches: 2 to filter shallow hits on multi-term prompts", () => {
    const both = article({ id: "both", title: "EU AI Act passes" });
    const onlyEu = article({ id: "eu", title: "EU summer travel" });
    const onlyAi = article({ id: "ai", title: "AI artwork show" });

    const result = matchArticles("eu ai act", [both, onlyEu, onlyAi], {
      minMatches: 2,
    });
    expect(result.map((m) => m.article.id)).toEqual(["both"]);
  });

  it("counts each prompt term once per article (set-based matching, not term-frequency)", () => {
    // "ai" appears five times in this article but its contribution to the
    // article's score must be the same as if it appeared once — the matcher
    // is set-based so a chatty article doesn't dominate.
    const noisy = article({ id: "noisy", title: "ai ai ai ai ai" });
    const single = article({ id: "single", title: "ai today" });
    const result = matchArticles("ai", [noisy, single]);
    expect(result[0].score).toEqual(result[1].score);
  });
});
