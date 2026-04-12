import { describe, it, expect } from "vitest";
import { parse } from "../../src/core/parser/parser.ts";

/**
 * Smoke test: fetches the real https://feedzero.app/releases.xml over the
 * network and verifies our parser can handle whatever the landing site is
 * currently serving. Catches real-world drift between the landing-site
 * generator and this app's parser that no mocked or vendored test can see.
 *
 * Skipped by default — runs only when SMOKE_TESTS=1 is set:
 *
 *   SMOKE_TESTS=1 npx vitest run tests/smoke/
 *
 * Suitable for nightly CI or manual pre-deploy verification. Not part of
 * the main `npm test` suite because it requires network access and its
 * result depends on the state of an external service.
 */
const SKIP = !process.env.SMOKE_TESTS;

describe.skipIf(SKIP)("release feed smoke test (live network)", () => {
  it("fetches https://feedzero.app/releases.xml and parses it", async () => {
    const response = await fetch("https://feedzero.app/releases.xml");
    expect(response.ok).toBe(true);

    const contentType = response.headers.get("content-type") ?? "";
    // Atom feeds should be application/atom+xml or application/xml or text/xml
    expect(contentType).toMatch(/xml/);

    const xml = await response.text();
    expect(xml.length).toBeGreaterThan(100);

    const result = parse(xml, "https://feedzero.app/releases.xml");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.feed.title).toBe("FeedZero Release Notes");
    expect(result.value.articles.length).toBeGreaterThan(0);

    // Every article must have the fields the app consumes
    for (const article of result.value.articles) {
      expect(article.title).toBeTruthy();
      expect(article.link).toBeTruthy();
      expect(article.guid).toBeTruthy();
      expect(article.publishedAt).toBeGreaterThan(0);
    }
  }, 10_000); // generous timeout for network
});
