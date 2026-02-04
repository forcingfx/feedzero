import { test, expect } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";

/**
 * Helper: adds a feed and waits for it to appear in the sidebar.
 */
async function addTestFeed(page: import("@playwright/test").Page) {
  await mockFeedEndpoint(page, SAMPLE_RSS);
  await page.getByRole("button", { name: "Add feed" }).click();
  await page
    .getByPlaceholder("Feed or site URL")
    .fill("https://example.com/feed");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Test Feed")).toBeVisible({ timeout: 10000 });
}

/** Scoped selector for an article in the list (not the reader heading). */
function articleOption(page: import("@playwright/test").Page, text: string) {
  return page.locator('[role="option"]', { hasText: text });
}

test.describe("Article navigation", () => {
  test("select feed shows articles", async ({ feedPage: page }) => {
    await addTestFeed(page);
    await page.getByText("Test Feed").click();

    // Articles should appear in the list
    await expect(articleOption(page, "First Article")).toBeVisible({
      timeout: 10000,
    });
    await expect(articleOption(page, "Second Article")).toBeVisible();
  });

  test("select article shows reader content", async ({ feedPage: page }) => {
    await addTestFeed(page);
    await page.getByText("Test Feed").click();
    await expect(articleOption(page, "First Article")).toBeVisible({
      timeout: 10000,
    });

    // Click an article in the list
    await articleOption(page, "Second Article").click();

    // Reader should show the article content
    await expect(
      page.getByText("Brief summary of the second article"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("URL updates on feed selection", async ({ feedPage: page }) => {
    await addTestFeed(page);
    await page.getByText("Test Feed").click();

    // URL should contain /feeds/<feedId>
    await page.waitForURL(/\/feeds\/[a-zA-Z0-9_-]+/, { timeout: 10000 });
    expect(page.url()).toMatch(/\/feeds\/[a-zA-Z0-9_-]+/);
  });

  test("URL updates on article selection", async ({ feedPage: page }) => {
    await addTestFeed(page);
    await page.getByText("Test Feed").click();
    await expect(articleOption(page, "First Article")).toBeVisible({
      timeout: 10000,
    });

    await articleOption(page, "Second Article").click();

    // URL should contain /feeds/<feedId>/articles/<articleId>
    await page.waitForURL(/\/feeds\/[^/]+\/articles\/[a-zA-Z0-9_-]+/, {
      timeout: 10000,
    });
    expect(page.url()).toMatch(/\/feeds\/[^/]+\/articles\/[a-zA-Z0-9_-]+/);
  });

  test("auto-selects first article when navigating to feed", async ({
    feedPage: page,
  }) => {
    await addTestFeed(page);
    await page.getByText("Test Feed").click();

    // Should auto-navigate to first article
    await page.waitForURL(/\/feeds\/[^/]+\/articles\/[a-zA-Z0-9_-]+/, {
      timeout: 10000,
    });

    // First article content should be visible in reader
    await expect(page.getByText("Short description only.")).toBeVisible({
      timeout: 10000,
    });
  });

  test("unread articles are bold", async ({ feedPage: page }) => {
    await addTestFeed(page);
    await page.getByText("Test Feed").click();
    await expect(articleOption(page, "First Article")).toBeVisible({
      timeout: 10000,
    });

    // Unread articles should have font-semibold class on their title
    const secondArticleItem = articleOption(page, "Second Article");
    await expect(secondArticleItem).toBeVisible();
    const titleEl = secondArticleItem.locator(".font-semibold");
    await expect(titleEl).toBeVisible();
  });

  test("selecting article marks as read (removes bold)", async ({
    feedPage: page,
  }) => {
    await addTestFeed(page);
    await page.getByText("Test Feed").click();
    await expect(articleOption(page, "Second Article")).toBeVisible({
      timeout: 10000,
    });

    // Click second article — it should get marked as read
    await articleOption(page, "Second Article").click();

    // Wait for the read state to be applied
    await page.waitForTimeout(500);

    // The article title should no longer have font-semibold
    const secondArticleItem = articleOption(page, "Second Article");
    const boldTitle = secondArticleItem.locator(".font-semibold");
    await expect(boldTitle).toHaveCount(0, { timeout: 5000 });
  });
});

test.describe("Article navigation — mobile", () => {
  test.use({ viewport: { width: 393, height: 851 } });

  test("feed selection shows article content", async ({ feedPage: page }) => {
    // On mobile, sidebar starts closed. Open it.
    await page.getByRole("button", { name: /toggle sidebar/i }).click();

    await addTestFeed(page);

    // Click the feed — on mobile, auto-select navigates directly to
    // the first article's reader view.
    await page.getByText("Test Feed").click();
    await page.waitForTimeout(500);

    // Dismiss the sidebar sheet by clicking the overlay area
    await page.mouse.click(380, 400);

    // Auto-select shows first article content in reader
    await expect(page.getByText("Short description only.")).toBeVisible({
      timeout: 10000,
    });

    // Back button should be visible for navigation
    await expect(page.getByRole("button", { name: /back/i })).toBeVisible();
  });

  test("navigating to /feeds shows empty state with sidebar prompt", async ({
    feedPage: page,
  }) => {
    // On mobile at /feeds with no feed selected, shows prompt to open sidebar
    await expect(
      page.getByText("Open the sidebar to select a feed"),
    ).toBeVisible({ timeout: 10000 });
  });
});
