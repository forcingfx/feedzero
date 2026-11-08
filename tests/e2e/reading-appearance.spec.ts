/**
 * Issue #341: Settings → Reading's Extra large text, Full width and
 * Relaxed line spacing change what the reader actually renders. Computed
 * styles are what the user sees, so this asserts on them rather than on
 * class names, which the unit tests already cover.
 */
import { test, expect, addFeedViaUI, selectFeedInSidebar, openArticle } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";

async function articleMetrics(page: import("@playwright/test").Page) {
  const column = page.locator("article").first();
  await expect(column).toBeVisible();
  return column.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      fontSize: parseFloat(style.fontSize),
      lineHeight: parseFloat(style.lineHeight),
      maxWidth: style.maxWidth,
    };
  });
}

async function choose(page: import("@playwright/test").Page, group: RegExp, option: RegExp) {
  await page.getByRole("group", { name: group }).getByRole("button", { name: option }).click();
}

test("larger text, full width and relaxed spacing reach the reader", async ({
  feedPage: page,
}, testInfo) => {
  await mockFeedEndpoint(page, SAMPLE_RSS);
  await addFeedViaUI(page, "https://example.com/feed");
  await selectFeedInSidebar(page, "Test Feed");
  await openArticle(page, "First Article");
  const before = await articleMetrics(page);
  const articleUrl = page.url();

  await page.goto("/settings?tab=reading");
  await choose(page, /text size/i, /^extra large$/i);
  await choose(page, /reading width/i, /^full$/i);
  await choose(page, /line spacing/i, /^relaxed$/i);
  await page.screenshot({ path: testInfo.outputPath("reading-settings.png"), fullPage: true });

  await page.goto(articleUrl);
  const after = await articleMetrics(page);
  await page.screenshot({ path: testInfo.outputPath("reader-after.png") });

  expect(after.fontSize).toBeGreaterThan(before.fontSize);
  expect(after.lineHeight / after.fontSize).toBeGreaterThan(before.lineHeight / before.fontSize);
  // The panel is often narrower than the Medium cap, so rendered widths
  // can match; what Full changes is that the column has no cap at all.
  expect(before.maxWidth).not.toBe("none");
  expect(after.maxWidth).toBe("none");
});
