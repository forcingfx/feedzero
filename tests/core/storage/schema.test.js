import { describe, it, expect } from "vitest";
import {
  createFeed,
  createArticle,
  validateFeed,
  validateArticle,
  SCHEMA_VERSION,
} from "../../../src/core/storage/schema.ts";
import { isOk, isErr, unwrap } from "@feedzero/core/utils/result";

describe("Schema", () => {
  describe("SCHEMA_VERSION", () => {
    it("should be 1", () => {
      expect(SCHEMA_VERSION).toBe(1);
    });
  });

  describe("createFeed", () => {
    it("should create a feed with required fields", () => {
      const result = createFeed({
        url: "https://example.com/rss",
        title: "Example",
      });
      expect(isOk(result)).toBe(true);
      const feed = unwrap(result);
      expect(feed.url).toBe("https://example.com/rss");
      expect(feed.title).toBe("Example");
      expect(feed.id).toBeTruthy();
      expect(feed.createdAt).toBeGreaterThan(0);
    });

    it("should apply defaults for optional fields", () => {
      const feed = unwrap(createFeed({ url: "https://x.com/rss", title: "X" }));
      expect(feed.description).toBe("");
      expect(feed.siteUrl).toBe("");
    });

    it("should reject missing url", () => {
      expect(isErr(createFeed({ title: "No URL" }))).toBe(true);
    });

    it("should reject missing title", () => {
      expect(isErr(createFeed({ url: "https://x.com" }))).toBe(true);
    });
  });

  describe("createArticle", () => {
    it("should create an article with required fields", () => {
      const result = createArticle({
        feedId: "f1",
        title: "Post",
        link: "https://x.com/1",
      });
      expect(isOk(result)).toBe(true);
      const article = unwrap(result);
      expect(article.feedId).toBe("f1");
      expect(article.read).toBe(false);
      // guid defaults to link when not provided
      expect(article.guid).toBe("https://x.com/1");
    });

    it("should use provided guid when given", () => {
      const result = createArticle({
        feedId: "f1",
        title: "Post",
        link: "https://x.com/1",
        guid: "tag:x.com,2024:1",
      });
      expect(isOk(result)).toBe(true);
      expect(unwrap(result).guid).toBe("tag:x.com,2024:1");
    });

    it("should reject missing feedId", () => {
      expect(isErr(createArticle({ title: "X", link: "https://x.com" }))).toBe(
        true,
      );
    });
  });

  describe("validateFeed", () => {
    it("should accept valid feed", () => {
      const feed = unwrap(createFeed({ url: "https://x.com/rss", title: "X" }));
      expect(isOk(validateFeed(feed))).toBe(true);
    });

    it("should reject null", () => {
      expect(isErr(validateFeed(null))).toBe(true);
    });

    it("should reject feed missing id", () => {
      expect(isErr(validateFeed({ url: "x", title: "y" }))).toBe(true);
    });
  });

  describe("validateArticle", () => {
    it("should accept valid article", () => {
      const article = unwrap(
        createArticle({ feedId: "f1", title: "P", link: "https://x.com" }),
      );
      expect(isOk(validateArticle(article))).toBe(true);
    });

    it("should reject article missing link", () => {
      expect(
        isErr(validateArticle({ id: "1", feedId: "f1", title: "P" })),
      ).toBe(true);
    });
  });
});
