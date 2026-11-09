import { describe, it, expect } from "vitest";
import { parse } from "@/core/parser/parser";

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Pictures</title>
    <link>https://example.com</link>
    <item>
      <title>Thumbnail item</title>
      <link>https://example.com/1</link>
      <guid>1</guid>
      <media:thumbnail url="https://cdn.example.com/1-thumb.jpg" width="300" height="200"/>
      <description>&lt;p&gt;&lt;img src="https://cdn.example.com/1-inline.jpg"&gt;&lt;/p&gt;</description>
    </item>
    <item>
      <title>Enclosure item</title>
      <link>https://example.com/2</link>
      <guid>2</guid>
      <enclosure url="https://cdn.example.com/2.png" type="image/png" length="1000"/>
      <description>Plain text.</description>
    </item>
    <item>
      <title>Inline image item</title>
      <link>https://example.com/3</link>
      <guid>3</guid>
      <content:encoded>&lt;p&gt;Hello&lt;/p&gt;&lt;img src="https://cdn.example.com/3.webp" alt=""&gt;</content:encoded>
    </item>
    <item>
      <title>No image item</title>
      <link>https://example.com/4</link>
      <guid>4</guid>
      <description>Nothing to see.</description>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Atom pictures</title>
  <entry>
    <title>Atom thumb</title>
    <link rel="alternate" href="https://example.com/a"/>
    <id>a</id>
    <updated>2026-11-01T00:00:00Z</updated>
    <media:thumbnail url="https://cdn.example.com/a.jpg"/>
    <summary>Text</summary>
  </entry>
</feed>`;

const JSON_FEED = JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  title: "JSON pictures",
  items: [
    { id: "j1", url: "https://example.com/j1", title: "JSON image", image: "https://cdn.example.com/j1.jpg", content_text: "x" },
    { id: "j2", url: "https://example.com/j2", title: "JSON none", content_text: "y" },
  ],
});

describe("parse(): lead image per item (#340)", () => {
  it("RSS: media:thumbnail beats the inline image; enclosure and inline images work; none stays undefined", () => {
    const result = parse(RSS, "https://example.com/feed");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byTitle = Object.fromEntries(result.value.articles.map((a) => [a.title, a.imageUrl]));
    expect(byTitle["Thumbnail item"]).toBe("https://cdn.example.com/1-thumb.jpg");
    expect(byTitle["Enclosure item"]).toBe("https://cdn.example.com/2.png");
    expect(byTitle["Inline image item"]).toBe("https://cdn.example.com/3.webp");
    expect(byTitle["No image item"]).toBeUndefined();
  });

  it("Atom: media:thumbnail on an entry", () => {
    const result = parse(ATOM, "https://example.com/atom");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.articles[0]?.imageUrl).toBe("https://cdn.example.com/a.jpg");
  });

  it("JSON Feed: the item's image field", () => {
    const result = parse(JSON_FEED, "https://example.com/feed.json");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byTitle = Object.fromEntries(result.value.articles.map((a) => [a.title, a.imageUrl]));
    expect(byTitle["JSON image"]).toBe("https://cdn.example.com/j1.jpg");
    expect(byTitle["JSON none"]).toBeUndefined();
  });
});
