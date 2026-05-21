import { describe, it, expect } from "vitest";
import {
  tokenize,
  lightStem,
  STOPWORDS,
  FEED_NOISE,
} from "@/core/signal/tokenize.ts";

describe("tokenize", () => {
  it("strips HTML, lowercases, and splits on word boundaries", () => {
    const tokens = tokenize("<p>OpenAI launches <b>GPT-5</b> today!</p>");
    expect(tokens).toContain("openai");
    expect(tokens).toContain("gpt");
    expect(tokens).toContain("launch");
    expect(tokens).toContain("today");
    expect(tokens).not.toContain("<p>");
    expect(tokens).not.toContain("p");
  });

  it("drops English stopwords", () => {
    const tokens = tokenize("the quick brown fox jumps over the lazy dog");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("over");
    expect(tokens).toContain("quick");
    expect(tokens).toContain("brown");
    expect(tokens).toContain("lazy");
  });

  it("drops feed-noise terms regardless of casing", () => {
    const tokens = tokenize("Read More about climate policy. Subscribe to comments.");
    expect(tokens).not.toContain("read");
    expect(tokens).not.toContain("more");
    expect(tokens).not.toContain("subscribe");
    expect(tokens).not.toContain("comments");
    expect(tokens).toContain("climate");
    expect(tokens).toContain("policy");
  });

  it("drops tokens shorter than 3 characters and all-numeric tokens", () => {
    const tokens = tokenize("AI in 2026 — a 5 minute read of GPT");
    expect(tokens).not.toContain("ai");
    expect(tokens).not.toContain("a");
    expect(tokens).not.toContain("5");
    expect(tokens).not.toContain("2026");
    expect(tokens).toContain("minute");
    expect(tokens).toContain("gpt");
  });

  it("returns an empty array for empty or whitespace-only input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   \n\t  ")).toEqual([]);
  });

  it("preserves duplicates so callers can count term frequency", () => {
    const tokens = tokenize("openai openai openai");
    expect(tokens).toEqual(["openai", "openai", "openai"]);
  });
});

describe("lightStem", () => {
  it.each([
    ["running", "run"],
    ["jumps", "jump"],
    ["edited", "edit"],
    ["watches", "watch"],
    ["fish", "fish"],
    ["news", "new"],
  ])("stems %s -> %s", (input, expected) => {
    expect(lightStem(input)).toBe(expected);
  });

  it("leaves tokens shorter than the suffix-strip floor alone", () => {
    expect(lightStem("ing")).toBe("ing");
    expect(lightStem("ed")).toBe("ed");
  });
});

describe("STOPWORDS / FEED_NOISE constants", () => {
  it("STOPWORDS covers core English function words", () => {
    for (const word of ["the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "is", "was"]) {
      expect(STOPWORDS.has(word)).toBe(true);
    }
  });

  it("FEED_NOISE covers common feed boilerplate", () => {
    for (const word of ["read", "more", "subscribe", "click", "comments", "share"]) {
      expect(FEED_NOISE.has(word)).toBe(true);
    }
  });
});
