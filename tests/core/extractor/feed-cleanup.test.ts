import { describe, it, expect } from "vitest";
import { cleanFeedContent } from "../../../src/core/extractor/cleanup.ts";

describe("cleanFeedContent", () => {
  describe("boilerplate removal", () => {
    it("removes standalone Share paragraph", () => {
      const html = "<p>Real content here.</p><p>Share</p>";
      const result = cleanFeedContent(html);
      expect(result).toBe("<p>Real content here.</p>");
    });

    it("removes standalone Save paragraph", () => {
      const html = "<p>Real content here.</p><p>Save</p>";
      const result = cleanFeedContent(html);
      expect(result).toBe("<p>Real content here.</p>");
    });

    it("removes standalone Comments paragraph", () => {
      const html = "<p>Real content here.</p><p>Comments</p>";
      const result = cleanFeedContent(html);
      expect(result).toBe("<p>Real content here.</p>");
    });

    it("removes Read full article link", () => {
      const html =
        '<p>Some content.</p><a href="https://example.com">Read full article</a>';
      const result = cleanFeedContent(html);
      expect(result).toBe("<p>Some content.</p>");
    });

    it("removes Continue reading link", () => {
      const html =
        '<p>Some content.</p><a href="https://example.com">Continue reading...</a>';
      const result = cleanFeedContent(html);
      expect(result).toBe("<p>Some content.</p>");
    });

    it("removes Continue reading with ellipsis character", () => {
      const html =
        '<p>Some content.</p><a href="https://example.com">Continue reading\u2026</a>';
      const result = cleanFeedContent(html);
      expect(result).toBe("<p>Some content.</p>");
    });

    it("removes Published On date line", () => {
      const html = "<p>Article text.</p><p>Published On 6 Apr 2026</p>";
      const result = cleanFeedContent(html);
      expect(result).toBe("<p>Article text.</p>");
    });

    it("removes Published date line without On", () => {
      const html = "<p>Article text.</p><p>Published 6 Apr 2026</p>";
      const result = cleanFeedContent(html);
      expect(result).toBe("<p>Article text.</p>");
    });

    it("does NOT remove legitimate paragraph containing Share", () => {
      const html =
        "<p>Share your experience with the community by writing a review.</p>";
      const result = cleanFeedContent(html);
      expect(result).toBe(html);
    });

    it("does NOT remove paragraph where boilerplate word is part of longer text", () => {
      const html = "<p>She saved the kitten from the tree</p>";
      const result = cleanFeedContent(html);
      expect(result).toBe(html);
    });

    it("preserves all non-boilerplate content", () => {
      const html =
        "<p>First paragraph.</p><p>Second paragraph with details.</p>";
      const result = cleanFeedContent(html);
      expect(result).toBe(html);
    });

    it("removes multiple boilerplate elements at once", () => {
      const html =
        "<p>Real content.</p><p>Share</p><p>Save</p><p>Comments</p>";
      const result = cleanFeedContent(html);
      expect(result).toBe("<p>Real content.</p>");
    });

    it("removes Read more link", () => {
      const html =
        '<p>Content.</p><a href="https://example.com">Read more</a>';
      const result = cleanFeedContent(html);
      expect(result).toBe("<p>Content.</p>");
    });

    it("removes Read more with ellipsis", () => {
      const html =
        '<p>Content.</p><a href="https://example.com">Read more...</a>';
      const result = cleanFeedContent(html);
      expect(result).toBe("<p>Content.</p>");
    });

    it("does not remove elements containing images", () => {
      const html =
        '<p>Share</p><div><img src="photo.jpg"></div><p>Save</p>';
      const result = cleanFeedContent(html);
      expect(result).toContain("<img");
      expect(result).not.toContain("Share");
      expect(result).not.toContain("Save");
    });
  });

  describe("title dedup", () => {
    it("removes first heading when it matches article title", () => {
      const html =
        "<h2>Article Title Here</h2><p>Article content follows.</p>";
      const result = cleanFeedContent(html, "Article Title Here");
      expect(result).toBe("<p>Article content follows.</p>");
    });

    it("removes heading with case-insensitive match", () => {
      const html =
        "<h2>article title here</h2><p>Article content follows.</p>";
      const result = cleanFeedContent(html, "Article Title Here");
      expect(result).toBe("<p>Article content follows.</p>");
    });

    it("removes heading with extra whitespace normalized", () => {
      const html =
        "<h2>  Article   Title   Here  </h2><p>Article content follows.</p>";
      const result = cleanFeedContent(html, "Article Title Here");
      expect(result).toBe("<p>Article content follows.</p>");
    });

    it("does NOT remove heading that differs from title", () => {
      const html =
        "<h2>Different Heading</h2><p>Article content follows.</p>";
      const result = cleanFeedContent(html, "Article Title Here");
      expect(result).toBe(html);
    });

    it("does NOT remove a matching heading that is not the first element", () => {
      const html =
        "<p>Intro paragraph.</p><h2>Article Title Here</h2><p>More content.</p>";
      const result = cleanFeedContent(html, "Article Title Here");
      expect(result).toBe(html);
    });

    it("handles undefined articleTitle gracefully", () => {
      const html =
        "<h2>Some Heading</h2><p>Content.</p>";
      const result = cleanFeedContent(html);
      expect(result).toBe(html);
    });

    it("handles h1 tags too", () => {
      const html =
        "<h1>Article Title Here</h1><p>Content.</p>";
      const result = cleanFeedContent(html, "Article Title Here");
      expect(result).toBe("<p>Content.</p>");
    });

    it("handles h3 tags too", () => {
      const html =
        "<h3>Article Title Here</h3><p>Content.</p>";
      const result = cleanFeedContent(html, "Article Title Here");
      expect(result).toBe("<p>Content.</p>");
    });
  });

  describe("tiny image removal", () => {
    it("removes images with both width and height below threshold", () => {
      const html =
        '<p>Content.</p><img src="thumb.jpg" width="80" height="60">';
      const result = cleanFeedContent(html);
      expect(result).not.toContain("<img");
      expect(result).toBe("<p>Content.</p>");
    });

    it("keeps images with dimensions above threshold", () => {
      const html =
        '<p>Content.</p><img src="photo.jpg" width="600" height="400">';
      const result = cleanFeedContent(html);
      expect(result).toContain("<img");
    });

    it("keeps images with no explicit dimensions", () => {
      const html = '<p>Content.</p><img src="photo.jpg">';
      const result = cleanFeedContent(html);
      expect(result).toContain("<img");
    });

    it("keeps images with only one dimension specified", () => {
      const html = '<p>Content.</p><img src="photo.jpg" width="80">';
      const result = cleanFeedContent(html);
      expect(result).toContain("<img");
    });

    it("removes parent figure when image is removed and figure becomes empty", () => {
      const html =
        '<figure><img src="thumb.jpg" width="80" height="60"></figure><p>Content.</p>';
      const result = cleanFeedContent(html);
      expect(result).not.toContain("<figure");
      expect(result).not.toContain("<img");
    });

    it("keeps figure with figcaption even if tiny image removed", () => {
      const html =
        '<figure><img src="thumb.jpg" width="80" height="60"><figcaption>Caption</figcaption></figure><p>Content.</p>';
      const result = cleanFeedContent(html);
      expect(result).not.toContain("<img");
      // Figure may remain with just the caption — that's fine
    });
  });

  describe("edge cases", () => {
    it("returns empty input unchanged", () => {
      expect(cleanFeedContent("")).toBe("");
    });

    it("returns null input unchanged", () => {
      expect(cleanFeedContent(null as unknown as string)).toBe(null);
    });

    it("content with no issues passes through unchanged", () => {
      const html =
        "<h2>Subtitle</h2><p>First paragraph.</p><p>Second paragraph.</p>";
      const result = cleanFeedContent(html);
      expect(result).toBe(html);
    });

    it("still removes empty elements", () => {
      const html = "<p>Content.</p><p></p><p>More.</p>";
      const result = cleanFeedContent(html);
      expect(result).toBe("<p>Content.</p><p>More.</p>");
    });

    it("still collapses consecutive br tags", () => {
      const html = "<p>Line 1<br><br><br>Line 2</p>";
      const result = cleanFeedContent(html);
      expect(result).toBe("<p>Line 1<br>Line 2</p>");
    });
  });

  describe("real feed snippets", () => {
    it("cleans Al Jazeera feed content", () => {
      const html = [
        '<figure><img src="https://example.com/photo.jpg" width="600" height="400"></figure>',
        "<p>Hegseth says strikes on Iran increasing as Hormuz deadline looms</p>",
        '<p>US Secretary of Defense Pete Hegseth said Monday will be the "largest volume of strikes".</p>',
        "<p>Published On 6 Apr 2026</p>",
        "<p>Save</p>",
        "<p>Share</p>",
      ].join("");

      const result = cleanFeedContent(
        html,
        "Hegseth says strikes on Iran increasing as Hormuz deadline looms",
      );

      expect(result).toContain("Secretary of Defense");
      expect(result).toContain("<img");
      expect(result).not.toContain("Published On");
      expect(result).not.toContain(">Save<");
      expect(result).not.toContain(">Share<");
    });

    it("cleans BBC News feed content with duplicate title", () => {
      const title =
        "'Lazy' dog owners hide poo bags in Hadrian's Wall";
      const html = [
        `<h2>${title}</h2>`,
        '<figure><img src="https://example.com/wall.jpg" width="800" height="600"><figcaption>Rangers say the bags are often pushed deep</figcaption></figure>',
        "<p>It took 15,000 soldiers six years to build.</p>",
        "<p>Walking out of the car park at Steel Rigg.</p>",
      ].join("");

      const result = cleanFeedContent(html, title);

      expect(result).not.toMatch(/<h2>/);
      expect(result).toContain("15,000 soldiers");
      expect(result).toContain("<img");
      expect(result).toContain("<figcaption>");
    });

    it("cleans Ars Technica feed content", () => {
      const html = [
        "<blockquote><p><em>\"Don't expect hi-res video.\"</em></p></blockquote>",
        "<p>Humanity is about to get its first in-person look at the Moon.</p>",
        "<p>You can tune into the webcast here, starting at 1 pm ET.</p>",
        '<p><a href="https://arstechnica.com/full">Read full article</a></p>',
        '<p><a href="https://arstechnica.com/comments">Comments</a></p>',
      ].join("");

      const result = cleanFeedContent(html);

      expect(result).toContain("Humanity is about");
      expect(result).toContain("<blockquote>");
      expect(result).not.toContain("Read full article");
      expect(result).not.toContain(">Comments<");
    });

    it("cleans Guardian feed content", () => {
      const html = [
        "<p>Claims explosives found near pipeline.</p>",
        "<p>Hungary has placed the gas pipeline under military protection.</p>",
        '<a href="https://theguardian.com/full">Continue reading...</a>',
      ].join("");

      const result = cleanFeedContent(html);

      expect(result).toContain("Claims explosives");
      expect(result).toContain("Hungary has placed");
      expect(result).not.toContain("Continue reading");
    });
  });
});
