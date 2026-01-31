import { describe, it, expect } from "vitest";
import {
  stripHtml,
  textsSimilar,
  getAvailableModes,
} from "../../../src/ui/components/content-modes.js";

describe("content-modes", () => {
  describe("stripHtml", () => {
    it("should strip HTML tags and normalize whitespace", () => {
      expect(stripHtml("<p>Hello  <strong>world</strong></p>")).toBe(
        "hello world",
      );
    });

    it("should return empty string for null/undefined", () => {
      expect(stripHtml(null)).toBe("");
      expect(stripHtml(undefined)).toBe("");
      expect(stripHtml("")).toBe("");
    });

    it("should return empty for image-only content", () => {
      expect(stripHtml('<img alt="Photo">')).toBe("");
    });
  });

  describe("textsSimilar", () => {
    it("should return true when shorter text is contained in longer", () => {
      const short = "the quick brown fox jumps over the lazy dog";
      const long =
        "the quick brown fox jumps over the lazy dog and then runs away into the forest";
      expect(textsSimilar(short, long)).toBe(true);
    });

    it("should return false for different texts", () => {
      expect(
        textsSimilar(
          "completely different content here",
          "nothing in common with the other text",
        ),
      ).toBe(false);
    });

    it("should return false when either is empty", () => {
      expect(textsSimilar("", "something")).toBe(false);
      expect(textsSimilar("something", "")).toBe(false);
      expect(textsSimilar("", "")).toBe(false);
    });
  });

  describe("getAvailableModes", () => {
    it("should return only feed when no summary and no link", () => {
      const modes = getAvailableModes({
        content: "<p>Some content</p>",
        summary: "",
        link: "",
      });
      expect(modes).toEqual(["feed"]);
    });

    it("should show summary when it differs from content", () => {
      const modes = getAvailableModes({
        content: "<p>Full article about technology trends in 2026.</p>",
        summary: "A completely different teaser that does not overlap.",
        link: "",
      });
      expect(modes).toContain("summary");
    });

    it("should hide summary when similar to content", () => {
      const modes = getAvailableModes({
        content:
          "<p>The quick brown fox jumps over the lazy dog and continues running.</p>",
        summary: "The quick brown fox jumps over the lazy dog",
        link: "https://example.com",
      });
      expect(modes).not.toContain("summary");
    });

    it("should hide extracted when content is longer than summary", () => {
      const modes = getAvailableModes({
        content:
          "<p>Thanks to Acme for sponsoring. Acme is great. Buy Acme products today.</p>",
        summary: "Thanks to Acme for sponsoring.",
        link: "https://example.com",
      });
      expect(modes).not.toContain("extracted");
    });

    it("should show extracted when content is short with valid link", () => {
      const modes = getAvailableModes({
        content: "<p>Brief intro.</p>",
        summary: "Brief intro.",
        link: "https://example.com",
      });
      expect(modes).toContain("extracted");
    });

    it("should hide extracted when cached extraction is similar to feed", () => {
      const modes = getAvailableModes({
        content: "<p>Brief intro.</p>",
        summary: "Brief intro.",
        link: "https://example.com",
        cachedExtraction: "<p>Brief intro.</p>",
      });
      expect(modes).not.toContain("extracted");
    });

    it("should show extracted when cached extraction differs from feed", () => {
      const modes = getAvailableModes({
        content: "<p>Brief intro.</p>",
        summary: "Brief intro.",
        link: "https://example.com",
        cachedExtraction:
          "<p>This is the full article with lots of additional detail and new information.</p>",
      });
      expect(modes).toContain("extracted");
    });
  });
});
