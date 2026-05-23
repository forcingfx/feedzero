import { describe, it, expect } from "vitest";
import {
  stripHtml,
  textsSimilar,
  getAvailableModes,
  hasSummarySubheading,
  isExtractionMeaningful,
  isFeedBlurbEmpty,
} from "../../src/lib/content-modes.ts";

/** Generate a string with exactly `n` words, starting from offset `from` to avoid prefix overlap. */
function words(n: number, from = 0): string {
  return Array.from({ length: n }, (_, i) => `word${from + i}`).join(" ");
}

describe("content-modes", () => {
  describe("stripHtml", () => {
    it("should strip HTML tags and normalize whitespace", () => {
      expect(stripHtml("<p>Hello  <strong>world</strong></p>")).toBe(
        "hello world",
      );
    });

    it("should return empty string for null/undefined", () => {
      expect(stripHtml(null as unknown as string)).toBe("");
      expect(stripHtml(undefined as unknown as string)).toBe("");
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

    it("should not include summary mode even when summary differs from content", () => {
      const modes = getAvailableModes({
        content: "<p>Full article about technology trends in 2026.</p>",
        summary: "A completely different teaser that does not overlap.",
        link: "",
      });
      expect(modes).not.toContain("summary");
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

    it("should show extracted when cached extraction is meaningfully richer", () => {
      const modes = getAvailableModes({
        content: "<p>Brief intro.</p>",
        summary: "Brief intro.",
        link: "https://example.com",
        cachedExtraction: `<p>${words(200, 500)}</p>`,
      });
      expect(modes).toContain("extracted");
    });

    it("should hide extracted for description-only feeds with 100+ words", () => {
      const fullArticle = `<p>${words(150)}</p>`;
      const modes = getAvailableModes({
        content: fullArticle,
        summary: fullArticle,
        link: "https://example.com",
      });
      expect(modes).not.toContain("extracted");
    });

    it("should show extracted for description-only feeds with short content", () => {
      const shortText = `<p>${words(30)}</p>`;
      const modes = getAvailableModes({
        content: shortText,
        summary: shortText,
        link: "https://example.com",
      });
      expect(modes).toContain("extracted");
    });

    it("should hide extracted when cached extraction is not meaningful", () => {
      const feedText = `<p>${words(30)}</p>`;
      const extractedText = `<p>${words(30)} ${words(20)}</p>`;
      const modes = getAvailableModes({
        content: feedText,
        summary: feedText,
        link: "https://example.com",
        cachedExtraction: extractedText,
      });
      expect(modes).not.toContain("extracted");
    });
  });

  describe("hasSummarySubheading", () => {
    it("should return true when content and summary both exist and differ", () => {
      expect(
        hasSummarySubheading(
          "<p>Full article about technology trends in 2026.</p>",
          "A completely different teaser that does not overlap.",
        ),
      ).toBe(true);
    });

    it("should return false when summary is similar to content", () => {
      expect(
        hasSummarySubheading(
          "<p>The quick brown fox jumps over the lazy dog and continues running.</p>",
          "The quick brown fox jumps over the lazy dog",
        ),
      ).toBe(false);
    });

    it("should return false when summary is empty", () => {
      expect(hasSummarySubheading("<p>Some content</p>", "")).toBe(false);
      expect(
        hasSummarySubheading("<p>Some content</p>", null as unknown as string),
      ).toBe(false);
    });

    it("should return false when content is empty", () => {
      expect(hasSummarySubheading("", "A summary")).toBe(false);
      expect(hasSummarySubheading(null as unknown as string, "A summary")).toBe(
        false,
      );
    });
  });

  describe("isFeedBlurbEmpty", () => {
    it("returns true when both content and summary are empty", () => {
      expect(isFeedBlurbEmpty("", "")).toBe(true);
    });

    it("returns true when both content and summary are null/undefined", () => {
      expect(isFeedBlurbEmpty(null as unknown as string, undefined as unknown as string)).toBe(true);
    });

    it("returns true for HTML that strips to nothing (image-only, empty tags)", () => {
      expect(isFeedBlurbEmpty('<img alt="">', "<p></p>")).toBe(true);
      expect(isFeedBlurbEmpty("<div>   </div>", "")).toBe(true);
    });

    it("returns false when content has readable text", () => {
      expect(isFeedBlurbEmpty("<p>Some text.</p>", "")).toBe(false);
    });

    it("returns false when summary has readable text", () => {
      expect(isFeedBlurbEmpty("", "<p>A teaser.</p>")).toBe(false);
    });
  });

  describe("isExtractionMeaningful", () => {
    it("should return true when extracted adds 100+ words and 50%+ increase", () => {
      expect(isExtractionMeaningful(words(200), words(350, 1000))).toBe(true);
    });

    it("should return false when extracted adds fewer than 100 words", () => {
      expect(isExtractionMeaningful(words(200), words(230, 1000))).toBe(false);
    });

    it("should return false when increase is less than 50%", () => {
      // 400 vs 300 = 33% increase, meets word count but not percentage
      expect(isExtractionMeaningful(words(300), words(400, 1000))).toBe(false);
    });

    it("should return true for short feed with substantial extraction", () => {
      expect(isExtractionMeaningful(words(50), words(300, 1000))).toBe(true);
    });

    it("should return false when texts are similar", () => {
      const text = "the quick brown fox jumps over the lazy dog and runs away";
      expect(isExtractionMeaningful(text, text + " some extra words")).toBe(
        false,
      );
    });

    it("should return false for empty inputs", () => {
      expect(isExtractionMeaningful("", words(200))).toBe(false);
      expect(isExtractionMeaningful(words(200), "")).toBe(false);
      expect(isExtractionMeaningful("", "")).toBe(false);
    });
  });
});
