import { describe, it, expect } from "vitest";
import { handleChangelogRequest } from "@/core/changelog/changelog-handler.ts";
import { releases } from "@/core/changelog/releases.ts";
import { parse } from "@/core/parser/parser.ts";

function request(path: string): Request {
  return new Request(`http://localhost${path}`);
}

describe("changelog-handler", () => {
  it("returns Atom XML with correct content type", async () => {
    const res = await handleChangelogRequest(request("/api/changelog.xml"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/atom+xml; charset=utf-8");
  });

  it("returns valid Atom feed structure", async () => {
    const res = await handleChangelogRequest(request("/api/changelog.xml"));
    const xml = await res.text();

    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xml).toContain("<feed");
    expect(xml).toContain("xmlns=\"http://www.w3.org/2005/Atom\"");
    expect(xml).toContain("<title>FeedZero Release Notes</title>");
  });

  it("contains an entry for each release", async () => {
    const res = await handleChangelogRequest(request("/api/changelog.xml"));
    const xml = await res.text();

    for (const release of releases) {
      expect(xml).toContain(`<title>v${release.version} — ${release.title}</title>`);
    }
  });

  it("entries have content with HTML", async () => {
    const res = await handleChangelogRequest(request("/api/changelog.xml"));
    const xml = await res.text();

    // At least one entry should have HTML content
    expect(xml).toContain('type="html"');
    expect(xml).toContain("<li>");
  });

  it("entries have unique IDs based on version", async () => {
    const res = await handleChangelogRequest(request("/api/changelog.xml"));
    const xml = await res.text();

    for (const release of releases) {
      expect(xml).toContain(`<id>feedzero:release:${release.version}</id>`);
    }
  });

  it("is publicly cacheable", async () => {
    const res = await handleChangelogRequest(request("/api/changelog.xml"));
    expect(res.headers.get("Cache-Control")).toContain("public");
  });

  it("has no user-identifying headers", async () => {
    const res = await handleChangelogRequest(request("/api/changelog.xml"));
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("parses correctly through the feed parser", async () => {
    const res = await handleChangelogRequest(request("/api/changelog.xml"));
    const xml = await res.text();
    const result = parse(xml, "/api/changelog.xml");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.feed.title).toBe("FeedZero Release Notes");
    expect(result.value.articles.length).toBe(releases.length);

    // Each article should have content and a guid
    for (const article of result.value.articles) {
      expect(article.guid).toBeTruthy();
      expect(article.content).toBeTruthy();
      expect(article.title).toBeTruthy();
    }
  });
});
