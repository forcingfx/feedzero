import { describe, it, expect } from "vitest";
import {
  proxyArticleImages,
  proxiedImageUrl,
} from "../../../src/core/proxy/proxy-article-images.ts";

/**
 * Feature: article-body images load through FeedZero's proxy.
 *
 * A reader opening an article must not make their browser contact the
 * publisher's image host: that request carries the reader's IP address.
 * Every remote image in the body therefore points at /api/icon instead.
 */
const ARTICLE = "https://news.example.com/2026/11/story.html";

function images(html: string): HTMLImageElement[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll("img"));
}

function proxiedTarget(src: string | null): string | null {
  if (!src) return null;
  const url = new URL(src, "https://my.feedzero.app");
  if (url.pathname !== "/api/icon") return null;
  return url.searchParams.get("url");
}

describe("proxiedImageUrl", () => {
  it("builds a same-origin /api/icon URL in article mode", () => {
    const url = new URL(
      proxiedImageUrl("https://cdn.example.com/a b.jpg?x=1&y=2", "article"),
      "https://my.feedzero.app",
    );
    expect(url.origin).toBe("https://my.feedzero.app");
    expect(url.pathname).toBe("/api/icon");
    expect(url.searchParams.get("url")).toBe(
      "https://cdn.example.com/a b.jpg?x=1&y=2",
    );
    expect(url.searchParams.get("mode")).toBe("article");
  });

  it("omits the mode for list thumbnails, which keep the small favicon cap", () => {
    expect(proxiedImageUrl("https://cdn.example.com/t.jpg", "thumbnail")).toBe(
      `/api/icon?url=${encodeURIComponent("https://cdn.example.com/t.jpg")}`,
    );
  });
});

describe("proxyArticleImages", () => {
  it("routes an absolute image through the proxy", () => {
    const [img] = images(
      proxyArticleImages('<p><img src="https://cdn.example.com/a.jpg" alt="A"></p>', ARTICLE),
    );
    expect(proxiedTarget(img.getAttribute("src"))).toBe("https://cdn.example.com/a.jpg");
    expect(img.getAttribute("alt")).toBe("A");
  });

  it("resolves a relative image against the article URL before proxying", () => {
    const [img] = images(proxyArticleImages('<img src="/media/b.png">', ARTICLE));
    expect(proxiedTarget(img.getAttribute("src"))).toBe(
      "https://news.example.com/media/b.png",
    );
  });

  it("resolves a protocol-relative image to https", () => {
    const [img] = images(proxyArticleImages('<img src="//cdn.example.com/c.gif">', ARTICLE));
    expect(proxiedTarget(img.getAttribute("src"))).toBe("https://cdn.example.com/c.gif");
  });

  it("leaves a data: URI alone, since it loads nothing from the network", () => {
    const data = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    const [img] = images(proxyArticleImages(`<img src="${data}">`, ARTICLE));
    expect(img.getAttribute("src")).toBe(data);
  });

  it("drops srcset and sizes, which would otherwise load directly from the publisher", () => {
    const [img] = images(
      proxyArticleImages(
        '<img src="https://cdn.example.com/a.jpg" srcset="https://cdn.example.com/a-2x.jpg 2x" sizes="100vw">',
        ARTICLE,
      ),
    );
    expect(img.hasAttribute("srcset")).toBe(false);
    expect(img.hasAttribute("sizes")).toBe(false);
    expect(proxiedTarget(img.getAttribute("src"))).toBe("https://cdn.example.com/a.jpg");
  });

  it("removes <picture> sources so the proxied <img> fallback is what loads", () => {
    const out = proxyArticleImages(
      '<picture><source srcset="https://cdn.example.com/a.webp" type="image/webp"><img src="https://cdn.example.com/a.jpg"></picture>',
      ARTICLE,
    );
    const doc = new DOMParser().parseFromString(out, "text/html");
    expect(doc.querySelector("source")).toBeNull();
    expect(proxiedTarget(doc.querySelector("img")!.getAttribute("src"))).toBe(
      "https://cdn.example.com/a.jpg",
    );
  });

  it("does not let any remote image URL survive in a load-bearing attribute", () => {
    const out = proxyArticleImages(
      [
        '<img src="https://a.example.com/1.jpg">',
        '<img src="/2.jpg" srcset="https://b.example.com/2.jpg 1x">',
        '<picture><source srcset="https://c.example.com/3.avif"><img src="https://c.example.com/3.jpg"></picture>',
      ].join(""),
      ARTICLE,
    );
    const doc = new DOMParser().parseFromString(out, "text/html");
    for (const el of doc.querySelectorAll("[src], [srcset]")) {
      const src = el.getAttribute("src");
      if (src) expect(src.startsWith("/api/icon?")).toBe(true);
      expect(el.hasAttribute("srcset")).toBe(false);
    }
  });

  it("keeps a relative image unproxied when there is no article URL to resolve it", () => {
    // Without a base it would resolve against FeedZero's own origin, which
    // tells no publisher anything; guessing a host would be worse.
    const [img] = images(proxyArticleImages('<img src="/media/b.png">'));
    expect(img.getAttribute("src")).toBe("/media/b.png");
  });

  it("leaves HTML without images untouched", () => {
    const html = "<p>Plain &amp; simple</p>";
    expect(proxyArticleImages(html, ARTICLE)).toBe(html);
  });
});
