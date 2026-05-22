import { describe, it, expect } from "vitest";
import { buildLexicon, extractEntities } from "@/core/signal/entities.ts";
import type { Article } from "@/types/index.ts";

const NOW = new Date("2026-05-21T12:00:00Z").getTime();

function makeArticle(id: string, title: string, content = ""): Article {
  return {
    id,
    feedId: `feed-${id}`,
    guid: id,
    title,
    link: `https://example.com/${id}`,
    content,
    summary: "",
    author: "",
    publishedAt: NOW,
    read: false,
    createdAt: NOW,
  };
}

function keys(article: Article, lexicon: ReturnType<typeof buildLexicon>): string[] {
  return extractEntities(article, lexicon).map((o) => o.key);
}

describe("buildLexicon — proper-noun consensus", () => {
  it("admits a word capitalized mid-sentence across articles", () => {
    const corpus = [
      makeArticle("1", "Quarterly review", "The Apple event impressed critics this week."),
      makeArticle("2", "Market notes", "Investors watched as Apple unveiled its plans."),
    ];
    const lexicon = buildLexicon(corpus);
    expect(lexicon.properNouns.has("apple")).toBe(true);
    expect(lexicon.properNouns.get("apple")).toBe("Apple");
  });

  it("rejects a word that appears lowercase mid-sentence", () => {
    const corpus = [
      makeArticle("1", "Snack notes", "I ate an apple and then another apple today."),
      makeArticle("2", "More snacks", "She prefers an apple over an orange most days."),
    ];
    const lexicon = buildLexicon(corpus);
    expect(lexicon.properNouns.has("apple")).toBe(false);
  });

  it("admits a word that only ever appears sentence-initial and never lowercase", () => {
    const corpus = [
      makeArticle("1", "OpenAI ships GPT release"),
      makeArticle("2", "OpenAI hires research team"),
    ];
    const lexicon = buildLexicon(corpus);
    expect(lexicon.properNouns.has("openai")).toBe(true);
  });

  it("rejects a common word capitalized only because it leads a headline", () => {
    const corpus = [
      makeArticle("1", "Markets tumble today", "Global markets fell as markets reacted to news."),
      makeArticle("2", "Markets recover", "By noon the markets had clawed back losses in markets."),
    ];
    const lexicon = buildLexicon(corpus);
    expect(lexicon.properNouns.has("markets")).toBe(false);
  });

  it("ignores stopwords and short tokens", () => {
    const corpus = [
      makeArticle("1", "review", "The And For event ran. The And For event ran again."),
      makeArticle("2", "notes", "And For appeared. And For appeared once more."),
    ];
    const lexicon = buildLexicon(corpus);
    expect(lexicon.properNouns.has("and")).toBe(false);
    expect(lexicon.properNouns.has("the")).toBe(false);
    expect(lexicon.properNouns.has("for")).toBe(false);
  });
});

describe("extractEntities", () => {
  it("emits a compound key for a mid-sentence capitalized run", () => {
    const lexicon = buildLexicon([
      makeArticle("seed", "Background", "Coverage of the Iran War deepened over the weekend."),
    ]);
    const article = makeArticle("1", "Update", "Tension over the Iran War grew sharply this month.");
    expect(keys(article, lexicon)).toContain("iran war");
  });

  it("emits confirmed proper nouns as unigram keys", () => {
    const corpus = [
      makeArticle("1", "OpenAI ships GPT release"),
      makeArticle("2", "OpenAI partners on safety"),
    ];
    const lexicon = buildLexicon(corpus);
    expect(keys(corpus[0], lexicon)).toContain("openai");
  });

  it("does not turn a Title-Cased headline into one giant entity", () => {
    const lexicon = buildLexicon([
      makeArticle("seed1", "x", "The Apple keynote drew a crowd as Apple demoed devices."),
      makeArticle("seed2", "y", "Later that day Apple confirmed the Apple lineup ships soon."),
    ]);
    const article = makeArticle("1", "Apple Unveils New Vision Pro Headset Today");
    const extracted = keys(article, lexicon);
    expect(extracted).not.toContain("apple unveils new vision pro headset today");
    // The confirmed proper noun still surfaces.
    expect(extracted).toContain("apple");
  });

  it("strips a trailing possessive so 'Trump's' matches 'Trump'", () => {
    const lexicon = buildLexicon([
      makeArticle("1", "x", "Critics said Trump misjudged the moment, and Trump pressed on."),
      makeArticle("2", "y", "Later Trump reversed course while Trump allies grumbled."),
    ]);
    const article = makeArticle("3", "x", "The room reacted to Trump's remarks on Trump policy.");
    expect(keys(article, lexicon)).toContain("trump");
  });
});
