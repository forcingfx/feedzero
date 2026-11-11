import type { Page, Request } from "@playwright/test";
import { test, expect, addFeedViaUI, selectFeedInSidebar } from "./fixtures";
import { mockFeedEndpoint, mockPageEndpoint } from "./feed-fixtures";

/**
 * Feature: article-body images load through FeedZero's proxy (ADR 034).
 *
 * The publisher's image host must never receive a request from the
 * reader's browser: that request carries the reader's IP address. Every
 * body image therefore loads from same-origin /api/icon?mode=article.
 * Runs on both projects, so the desktop reader and the mobile reader
 * layer are each covered.
 */
const PUBLISHER = "publisher.test";
const ARTICLE_URL = `https://${PUBLISHER}/2026/11/story`;

const IMAGE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Image Feed</title>
    <link>https://${PUBLISHER}</link>
    <description>Feed with images in the body</description>
    <item>
      <title>Photo Story</title>
      <link>${ARTICLE_URL}</link>
      <description><![CDATA[<p>Lead paragraph.</p><p><img src="https://images.${PUBLISHER}/hero.png" alt="Hero photo"></p><p><img src="/media/chart.png" alt="Relative chart"></p>]]></description>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <guid>${ARTICLE_URL}</guid>
    </item>
  </channel>
</rss>`;

const IMAGE_PAGE = `<!DOCTYPE html>
<html><head><title>Photo Story</title></head>
<body><article>
  <h1>Extracted Photo Story</h1>
  <p>${"Long-form extracted paragraph about the photographs. ".repeat(20)}</p>
  <figure><img src="https://images.${PUBLISHER}/extracted.png" alt="Extracted photo"></figure>
  <p>Closing paragraph.</p>
</article></body></html>`;

/** A visible stand-in image, so the screenshot shows the proxy served it. */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240"><rect width="480" height="240" fill="#2f6f4f"/><text x="24" y="132" font-size="28" fill="#fff" font-family="sans-serif">served by /api/icon</text></svg>`;

/** Serve /api/icon in the browser and record every direct publisher hit. */
async function routeImages(page: Page) {
  const proxied: string[] = [];
  const direct: string[] = [];
  await page.route("**/api/icon?*", (route) => {
    proxied.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "image/svg+xml", body: SVG });
  });
  page.on("request", (req: Request) => {
    if (new URL(req.url()).hostname.endsWith(PUBLISHER)) direct.push(req.url());
  });
  await page.route(`**://*${PUBLISHER}/**`, (route) => route.abort());
  return { proxied, direct };
}

async function openPhotoStory(page: Page) {
  await mockFeedEndpoint(page, IMAGE_FEED);
  await addFeedViaUI(page, `https://${PUBLISHER}/feed`);
  await selectFeedInSidebar(page, "Image Feed");
  const row = page.locator('[role="option"]', { hasText: "Photo Story" });
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.click();
}

/** The `url` a proxied image src asks for, after checking its shape. */
async function proxiedTarget(page: Page, alt: string): Promise<string | null> {
  const img = page.getByAltText(alt);
  await expect(img).toBeVisible({ timeout: 10000 });
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  const src = new URL((await img.getAttribute("src"))!, page.url());
  expect(src.origin).toBe(new URL(page.url()).origin);
  expect(src.pathname).toBe("/api/icon");
  expect(src.searchParams.get("mode")).toBe("article");
  return src.searchParams.get("url");
}

test.describe("Article images through the proxy", () => {
  test("feed-content images load via /api/icon, never from the publisher", async ({
    feedPage: page,
  }, testInfo) => {
    const { proxied, direct } = await routeImages(page);
    await openPhotoStory(page);

    expect(await proxiedTarget(page, "Hero photo")).toBe(
      `https://images.${PUBLISHER}/hero.png`,
    );
    expect(await proxiedTarget(page, "Relative chart")).toBe(
      `https://${PUBLISHER}/media/chart.png`,
    );
    expect(proxied.length).toBeGreaterThanOrEqual(2);
    expect(direct).toEqual([]);

    await page.getByAltText("Hero photo").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`article-images-${testInfo.project.name}.png`),
    });
  });

  test("extracted full-text images load via /api/icon, never from the publisher", async ({
    feedPage: page,
  }) => {
    const { direct } = await routeImages(page);
    await mockPageEndpoint(page, IMAGE_PAGE);
    await openPhotoStory(page);

    await page.getByRole("button", { name: /Full text/ }).click();
    expect(await proxiedTarget(page, "Extracted photo")).toBe(
      `https://images.${PUBLISHER}/extracted.png`,
    );
    expect(direct).toEqual([]);
  });
});
