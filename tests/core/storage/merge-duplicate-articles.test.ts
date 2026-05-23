import { describe, it, expect } from "vitest";
import { mergeDuplicateArticles } from "../../../src/core/storage/dedupe-articles.ts";
import type { Article } from "@feedzero/core/types";

const article = (overrides: Partial<Article>): Article => ({
  id: "a1",
  feedId: "f1",
  guid: "g1",
  title: "Title",
  link: "https://example.com/post",
  content: "<p>body</p>",
  summary: "summary",
  author: "Author",
  publishedAt: 1000,
  read: false,
  createdAt: 1000,
  ...overrides,
});

describe("mergeDuplicateArticles", () => {
  it("keeps the base id and content", () => {
    const base = article({ id: "keep", content: "<p>base</p>" });
    const merged = mergeDuplicateArticles(base, [
      article({ id: "dropme", content: "<p>other</p>" }),
    ]);
    expect(merged.id).toBe("keep");
    expect(merged.content).toBe("<p>base</p>");
  });

  it("marks merged read if any copy was read", () => {
    const merged = mergeDuplicateArticles(article({ read: false }), [
      article({ id: "a2", read: true, readAt: 5000 }),
    ]);
    expect(merged.read).toBe(true);
    expect(merged.readAt).toBe(5000);
  });

  it("marks merged starred if any copy was starred and keeps latest starredAt", () => {
    const merged = mergeDuplicateArticles(
      article({ starred: true, starredAt: 100 }),
      [article({ id: "a2", starred: false, starredAt: undefined })],
    );
    expect(merged.starred).toBe(true);
    expect(merged.starredAt).toBe(100);
  });

  it("marks merged muted if any copy was muted", () => {
    const merged = mergeDuplicateArticles(article({ muted: false }), [
      article({ id: "a2", muted: true }),
    ]);
    expect(merged.muted).toBe(true);
  });

  it("adopts extracted content from a copy when the base has none", () => {
    const merged = mergeDuplicateArticles(
      article({ extractedContent: undefined, extractedAt: undefined }),
      [article({ id: "a2", extractedContent: "<p>full</p>", extractedAt: 42 })],
    );
    expect(merged.extractedContent).toBe("<p>full</p>");
    expect(merged.extractedAt).toBe(42);
  });

  it("does not lose the base's user state when copies are clean", () => {
    const base = article({ read: true, starred: true, starredAt: 9 });
    const merged = mergeDuplicateArticles(base, [article({ id: "a2" })]);
    expect(merged.read).toBe(true);
    expect(merged.starred).toBe(true);
    expect(merged.starredAt).toBe(9);
  });
});
