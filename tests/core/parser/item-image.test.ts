import { describe, it, expect } from "vitest";
import { pickItemImage } from "@/core/parser/item-image";

/**
 * Issue #340: a lead image for the article list. Sources, in order of how
 * deliberately the publisher chose them: media:thumbnail, an image
 * media:content, an image enclosure, then the first <img> in the body.
 * Only absolute http(s) URLs qualify; anything else yields undefined.
 */
describe("pickItemImage", () => {
  it("prefers media:thumbnail", () => {
    const url = pickItemImage(
      {
        media: {
          thumbnails: [{ url: "https://cdn.example.com/thumb.jpg" }],
          contents: [{ url: "https://cdn.example.com/full.jpg", type: "image/jpeg" }],
        },
      },
      '<p><img src="https://cdn.example.com/inline.png"></p>',
    );
    expect(url).toBe("https://cdn.example.com/thumb.jpg");
  });

  it("falls back to an image media:content, skipping video", () => {
    const url = pickItemImage({
      media: {
        contents: [
          { url: "https://cdn.example.com/clip.mp4", type: "video/mp4" },
          { url: "https://cdn.example.com/still.jpg", medium: "image" },
        ],
      },
    });
    expect(url).toBe("https://cdn.example.com/still.jpg");
  });

  it("falls back to an image enclosure, skipping audio", () => {
    const url = pickItemImage({
      enclosures: [
        { url: "https://cdn.example.com/episode.mp3", type: "audio/mpeg" },
        { url: "https://cdn.example.com/cover.png", type: "image/png" },
      ],
    });
    expect(url).toBe("https://cdn.example.com/cover.png");
  });

  it("falls back to the first <img> in the body", () => {
    const url = pickItemImage(
      {},
      '<p>Intro</p><figure><img alt="x" src="https://img.example.com/a.webp"/></figure>',
    );
    expect(url).toBe("https://img.example.com/a.webp");
  });

  it("ignores relative, data:, and javascript: URLs", () => {
    expect(pickItemImage({}, '<img src="/images/a.png">')).toBeUndefined();
    expect(pickItemImage({}, '<img src="data:image/png;base64,AAAA">')).toBeUndefined();
    expect(pickItemImage({ media: { thumbnails: [{ url: "javascript:alert(1)" }] } })).toBeUndefined();
  });

  it("returns undefined when there is no image anywhere", () => {
    expect(pickItemImage({}, "<p>Text only</p>")).toBeUndefined();
    expect(pickItemImage({})).toBeUndefined();
  });
});
