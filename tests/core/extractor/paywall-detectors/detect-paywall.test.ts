import { describe, expect, it } from "vitest";
import { detectPaywall } from "@/core/extractor/paywall-detectors/index.ts";

const NYT_FULL = `
  <html>
    <body>
      <article>
        <p>${"Lorem ipsum dolor sit amet, ".repeat(80)}</p>
        <p>${"Consectetur adipiscing elit, sed do eiusmod tempor. ".repeat(50)}</p>
      </article>
    </body>
  </html>
`;

const NYT_PAYWALL_STUB = `
  <html>
    <body>
      <article>
        <p>NEW YORK — A short teaser of about 60 words goes here so the
        body length alone is not the only signal we rely on. The article
        continues but is hidden behind a paywall. The reader sees only
        this teaser before the gate appears.</p>
      </article>
      <div class="css-mcm29f">
        <h2>You have been granted access, use your free article to view this story.</h2>
        <p>Already a subscriber? <a href="/login">Log in</a>.</p>
      </div>
    </body>
  </html>
`;

const GENERIC_FREE = `
  <html><body><article>${"This article is fully free. ".repeat(200)}</article></body></html>
`;

const GENERIC_PAYWALLED = `
  <html><body>
    <p>Read the first paragraph for free.</p>
    <div class="paywall">
      <h2>Subscribe to read</h2>
      <p>Subscribers get unlimited access.</p>
    </div>
  </body></html>
`;

const SHORT_BODY = `<html><body><article><p>One tiny paragraph.</p></article></body></html>`;

const ECONOMIST_FULL = `
  <html><body>
    <article>${"<p>Long economist article paragraph with substantive analysis. </p>".repeat(60)}</article>
  </body></html>
`;

const ECONOMIST_PAYWALL_STUB = `
  <html><body>
    <article>
      <p>The opening paragraph appears, giving a teaser of the story.</p>
    </article>
    <div class="subscribe-gate">
      <h2>Subscribe to The Economist</h2>
      <p>To continue reading this article you need to subscribe.</p>
    </div>
  </body></html>
`;

describe("detectPaywall", () => {
  describe("nytimes detector", () => {
    it("flags an NYT page that contains the subscriber CTA", () => {
      const verdict = detectPaywall(NYT_PAYWALL_STUB, "https://www.nytimes.com/2026/05/21/world/foo.html");
      expect(verdict.paywalled).toBe(true);
      expect(verdict.publisher).toBe("nytimes.com");
    });

    it("does not flag an NYT page whose body is long and has no subscriber CTA", () => {
      const verdict = detectPaywall(NYT_FULL, "https://www.nytimes.com/2026/05/21/world/foo.html");
      expect(verdict.paywalled).toBe(false);
      expect(verdict.publisher).toBe("nytimes.com");
    });

    it("detects nytimes for www.nytimes.com, nytimes.com, and cooking.nytimes.com", () => {
      const a = detectPaywall(NYT_PAYWALL_STUB, "https://nytimes.com/foo");
      const b = detectPaywall(NYT_PAYWALL_STUB, "https://www.nytimes.com/foo");
      const c = detectPaywall(NYT_PAYWALL_STUB, "https://cooking.nytimes.com/foo");
      expect(a.publisher).toBe("nytimes.com");
      expect(b.publisher).toBe("nytimes.com");
      expect(c.publisher).toBe("nytimes.com");
    });
  });

  describe("economist detector", () => {
    it("flags an Economist page that contains the subscribe-to-continue CTA with reason 'economist-cta'", () => {
      const verdict = detectPaywall(
        ECONOMIST_PAYWALL_STUB,
        "https://www.economist.com/finance/2026/05/21/an-article",
      );
      expect(verdict.paywalled).toBe(true);
      expect(verdict.publisher).toBe("economist.com");
      if (verdict.paywalled) expect(verdict.reason).toBe("economist-cta");
    });

    it("flags an Economist page even when the body length alone would not (publisher detector runs first)", () => {
      // Long enough body that the default body-too-short heuristic would
      // not trip; the only paywall signal is the Economist subscribe block.
      const longish = `
        <html><body>
          <article>${"<p>Substantial paragraph of analysis. </p>".repeat(40)}</article>
          <aside class="ec-subscribe">Get unlimited access to economist.com — subscribe now to The Economist.</aside>
        </body></html>
      `;
      const verdict = detectPaywall(longish, "https://www.economist.com/x");
      expect(verdict.paywalled).toBe(true);
      if (verdict.paywalled) expect(verdict.reason).toBe("economist-cta");
    });

    it("does not flag a fully-readable Economist article", () => {
      const verdict = detectPaywall(
        ECONOMIST_FULL,
        "https://www.economist.com/finance/2026/05/21/an-article",
      );
      expect(verdict.paywalled).toBe(false);
      expect(verdict.publisher).toBe("economist.com");
    });

    it("matches economist.com and the www. subdomain", () => {
      const a = detectPaywall(ECONOMIST_PAYWALL_STUB, "https://economist.com/x");
      const b = detectPaywall(
        ECONOMIST_PAYWALL_STUB,
        "https://www.economist.com/x",
      );
      expect(a.publisher).toBe("economist.com");
      expect(b.publisher).toBe("economist.com");
    });
  });

  describe("default detector", () => {
    it("does not flag a page with substantial body text and no paywall phrases", () => {
      const verdict = detectPaywall(GENERIC_FREE, "https://example.com/post");
      expect(verdict.paywalled).toBe(false);
    });

    it("flags a page that contains a known paywall phrase", () => {
      const verdict = detectPaywall(GENERIC_PAYWALLED, "https://example.com/post");
      expect(verdict.paywalled).toBe(true);
      if (verdict.paywalled) expect(verdict.reason).toBe("phrase-match");
    });

    it("flags pages with a body-text length below the threshold (likely stub)", () => {
      const verdict = detectPaywall(SHORT_BODY, "https://example.com/post");
      expect(verdict.paywalled).toBe(true);
      if (verdict.paywalled) expect(verdict.reason).toBe("body-too-short");
    });

    it("returns publisher as the URL host with the leading www. stripped", () => {
      const verdict = detectPaywall(SHORT_BODY, "https://www.example.com/post");
      expect(verdict.publisher).toBe("example.com");
    });

    it("returns the host even for an unparseable URL by returning null publisher", () => {
      const verdict = detectPaywall(GENERIC_FREE, "not a url at all");
      expect(verdict.publisher).toBe(null);
    });
  });

  describe("verdict shape", () => {
    it("returns paywalled=false and publisher when the html is clearly free", () => {
      const verdict = detectPaywall(GENERIC_FREE, "https://example.com/x");
      expect(verdict).toEqual({
        paywalled: false,
        publisher: "example.com",
      });
    });

    it("returns paywalled=true with a reason and publisher when flagged", () => {
      const verdict = detectPaywall(GENERIC_PAYWALLED, "https://example.com/x");
      expect(verdict.paywalled).toBe(true);
      expect(verdict.publisher).toBe("example.com");
      if (verdict.paywalled) {
        expect(typeof verdict.reason).toBe("string");
      }
    });
  });
});
