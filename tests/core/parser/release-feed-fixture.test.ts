import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parse } from "../../../src/core/parser/parser.ts";

/**
 * Contract test: parse the vendored copy of the real release notes feed
 * served by the landing site at https://feedzero.app/releases.xml.
 *
 * This fixture was captured via `curl` and checked into `tests/fixtures/`.
 * If the landing-side generator changes its Atom format in a way that
 * breaks our parser, this test fails — before any user sees a broken
 * sidebar. Update the fixture by re-fetching the live URL.
 */
const feedXml = readFileSync(
  resolve(__dirname, "../../fixtures/release-feed.xml"),
  "utf-8",
);

describe("release feed fixture (contract test)", () => {
  it("parses the vendored release feed without errors", () => {
    const result = parse(feedXml, "https://feedzero.app/releases.xml");
    expect(result.ok).toBe(true);
  });

  it("extracts the feed title and site URL", () => {
    const result = parse(feedXml, "https://feedzero.app/releases.xml");
    if (!result.ok) throw new Error(result.error);

    expect(result.value.feed.title).toBe("FeedZero Release Notes");
    expect(result.value.feed.siteUrl).toBe("https://feedzero.app/#releases");
  });

  it("extracts at least one article with the fields the app consumes", () => {
    const result = parse(feedXml, "https://feedzero.app/releases.xml");
    if (!result.ok) throw new Error(result.error);

    expect(result.value.articles.length).toBeGreaterThan(0);

    const article = result.value.articles[0];
    // Every field that article-store, article-list, and reader-panel read:
    expect(article.title).toBeTruthy();
    expect(article.link).toBeTruthy();
    expect(article.content).toBeTruthy();
    expect(article.publishedAt).toBeGreaterThan(0);
    expect(article.guid).toBeTruthy();
  });

  it("parses all entries — fixture should have multiple releases", () => {
    const result = parse(feedXml, "https://feedzero.app/releases.xml");
    if (!result.ok) throw new Error(result.error);

    // The landing site has multiple release entries. If only 1 parses,
    // the generator or the parser is silently dropping entries.
    expect(result.value.articles.length).toBeGreaterThanOrEqual(2);
  });
});
