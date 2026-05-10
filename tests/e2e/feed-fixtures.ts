import type { Page } from "@playwright/test";

/** RSS 2.0 feed with 5 articles of varying content lengths. */
export const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <description>A test feed for E2E tests</description>
    <item>
      <title>First Article</title>
      <link>https://example.com/first</link>
      <description>Short description only.</description>
      <pubDate>Fri, 03 Jan 2025 12:00:00 GMT</pubDate>
      <guid>https://example.com/first</guid>
    </item>
    <item>
      <title>Second Article</title>
      <link>https://example.com/second</link>
      <description>Brief summary of the second article.</description>
      <pubDate>Thu, 02 Jan 2025 12:00:00 GMT</pubDate>
      <guid>https://example.com/second</guid>
    </item>
    <item>
      <title>Third Article</title>
      <link>https://example.com/third</link>
      <description>${"This is a long article with plenty of content to read. ".repeat(20)}</description>
      <pubDate>Wed, 01 Jan 2025 12:00:00 GMT</pubDate>
      <guid>https://example.com/third</guid>
    </item>
    <item>
      <title>Fourth Article</title>
      <link>https://example.com/fourth</link>
      <description>${"Another long article with extensive content for scroll testing. ".repeat(40)}</description>
      <pubDate>Tue, 31 Dec 2024 12:00:00 GMT</pubDate>
      <guid>https://example.com/fourth</guid>
    </item>
    <item>
      <title>Entity &amp; Decode Test</title>
      <link>https://example.com/fifth</link>
      <description>Article with HTML entities: &lt;strong&gt;bold&lt;/strong&gt; &amp; more.</description>
      <pubDate>Mon, 30 Dec 2024 12:00:00 GMT</pubDate>
      <guid>https://example.com/fifth</guid>
    </item>
  </channel>
</rss>`;

/** Atom feed with 2 articles. */
export const SAMPLE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Test Feed</title>
  <link href="https://atom-example.com" rel="alternate"/>
  <id>urn:uuid:atom-test-feed</id>
  <updated>2025-01-03T12:00:00Z</updated>
  <entry>
    <title>Atom Entry One</title>
    <link href="https://atom-example.com/one" rel="alternate"/>
    <id>urn:uuid:atom-entry-one</id>
    <updated>2025-01-03T12:00:00Z</updated>
    <summary>Summary of the first Atom entry.</summary>
  </entry>
  <entry>
    <title>Atom Entry Two</title>
    <link href="https://atom-example.com/two" rel="alternate"/>
    <id>urn:uuid:atom-entry-two</id>
    <updated>2025-01-02T12:00:00Z</updated>
    <summary>Summary of the second Atom entry.</summary>
  </entry>
</feed>`;

/** JSON Feed 1.1 with 2 items. */
export const SAMPLE_JSON_FEED = JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  title: "JSON Test Feed",
  home_page_url: "https://json-example.com",
  feed_url: "https://json-example.com/feed.json",
  items: [
    {
      id: "json-1",
      title: "JSON Entry One",
      url: "https://json-example.com/one",
      content_text: "Content of the first JSON Feed entry.",
      date_published: "2025-01-03T12:00:00Z",
    },
    {
      id: "json-2",
      title: "JSON Entry Two",
      url: "https://json-example.com/two",
      content_text: "Content of the second JSON Feed entry.",
      date_published: "2025-01-02T12:00:00Z",
    },
  ],
});

/** Full HTML page for extraction testing. */
export const SAMPLE_PAGE_HTML = `<!DOCTYPE html>
<html>
<head><title>Full Article Page</title></head>
<body>
  <article>
    <h1>Full Article Title</h1>
    <p>${"This is the full extracted article content with many paragraphs of text. ".repeat(15)}</p>
    <p>Second paragraph with additional details and analysis.</p>
    <p>Third paragraph wrapping up the article with conclusions.</p>
  </article>
</body>
</html>`;

/** RSS feed with an extra article for refresh testing. */
export const SAMPLE_RSS_UPDATED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <description>A test feed for E2E tests</description>
    <item>
      <title>Brand New Article</title>
      <link>https://example.com/new</link>
      <description>This article was added after refresh.</description>
      <pubDate>Sat, 04 Jan 2025 12:00:00 GMT</pubDate>
      <guid>https://example.com/new</guid>
    </item>
    <item>
      <title>First Article</title>
      <link>https://example.com/first</link>
      <description>Short description only.</description>
      <pubDate>Fri, 03 Jan 2025 12:00:00 GMT</pubDate>
      <guid>https://example.com/first</guid>
    </item>
    <item>
      <title>Second Article</title>
      <link>https://example.com/second</link>
      <description>Brief summary of the second article.</description>
      <pubDate>Thu, 02 Jan 2025 12:00:00 GMT</pubDate>
      <guid>https://example.com/second</guid>
    </item>
  </channel>
</rss>`;

/**
 * Intercepts /api/feed requests and responds with the given feed XML/JSON.
 * Returns a function to update the response for subsequent requests.
 */
export async function mockFeedEndpoint(page: Page, feedContent: string) {
  const contentType = feedContent.trimStart().startsWith("{")
    ? "application/json"
    : "text/xml";

  await page.route("**/api/feed*", (route) => {
    // The app auto-subscribes to the release-notes feed on first launch
    // (`CHANGELOG_FEED_URL = https://feedzero.app/releases.xml`). It goes
    // through the same `POST /api/feed` proxy as user-added feeds — the
    // target URL travels in the JSON body, NOT the query string. If we
    // respond with `feedContent` here too, the release-notes feed lands
    // in the sidebar with the SAME title as the test feed and selectors
    // filtering by title resolve to two elements (Playwright strict-mode
    // violation).
    //
    // Auto-subscribe is wrapped in try/catch (best-effort), so 404 here
    // is silently swallowed and no rogue feed appears in the sidebar.
    const targetUrl = readTargetUrlFromBody(route.request().postData());
    if (targetUrl.includes("releases.xml")) {
      route.fulfill({ status: 404, body: "not found in test" });
      return;
    }
    route.fulfill({
      status: 200,
      contentType,
      body: feedContent,
    });
  });
}

/**
 * The proxy POST body is `{"url":"<target>"}`. Returns the target URL,
 * or "" if the body is missing/malformed (so the caller treats it as
 * a non-release-notes URL and serves the regular fixture content).
 */
function readTargetUrlFromBody(rawBody: string | null): string {
  if (!rawBody) return "";
  try {
    const parsed = JSON.parse(rawBody);
    return typeof parsed?.url === "string" ? parsed.url : "";
  } catch {
    return "";
  }
}

/**
 * Intercepts /api/page requests and responds with the given HTML.
 */
export async function mockPageEndpoint(page: Page, html: string) {
  await page.route("**/api/page*", (route) => {
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: html,
    });
  });
}

/**
 * Intercepts /api/feed requests and responds with a 500 error.
 */
export async function mockFeedEndpointError(page: Page) {
  await page.route("**/api/feed*", (route) => {
    route.fulfill({
      status: 500,
      contentType: "text/plain",
      body: "Internal Server Error",
    });
  });
}

/**
 * Intercepts /api/page requests and responds with a 500 error.
 */
export async function mockPageEndpointError(page: Page) {
  await page.route("**/api/page*", (route) => {
    route.fulfill({
      status: 500,
      contentType: "text/plain",
      body: "Internal Server Error",
    });
  });
}

/**
 * Intercepts /api/feed requests and responds with an HTML page (non-feed).
 */
export async function mockFeedEndpointHtml(page: Page) {
  await page.route("**/api/feed*", (route) => {
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!DOCTYPE html><html><body><h1>Not a feed</h1></body></html>",
    });
  });
}
