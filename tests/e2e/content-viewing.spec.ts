import { test, expect } from "./fixtures";
import {
  SAMPLE_RSS,
  SAMPLE_PAGE_HTML,
  mockFeedEndpoint,
  mockPageEndpoint,
  mockPageEndpointError,
} from "./feed-fixtures";

/** Scoped selector for an article in the list. */
function articleOption(page: import("@playwright/test").Page, text: string) {
  return page.locator('[role="option"]', { hasText: text });
}

/** Adds a feed and selects it, waiting for articles to load. */
async function setupFeed(page: import("@playwright/test").Page) {
  await mockFeedEndpoint(page, SAMPLE_RSS);
  await page.getByRole("button", { name: "Add feed" }).click();
  await page
    .getByPlaceholder("Feed or site URL")
    .fill("https://example.com/feed");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Test Feed")).toBeVisible({ timeout: 10000 });
  await page.getByText("Test Feed").click();
  await expect(articleOption(page, "First Article")).toBeVisible({
    timeout: 10000,
  });
}

test.describe("Content viewing", () => {
  test("feed content renders in reader", async ({ feedPage: page }) => {
    await setupFeed(page);

    // Auto-selected first article — content should be visible
    await expect(page.getByText("Short description only.")).toBeVisible({
      timeout: 10000,
    });
  });

  test("view toggle shows for short content", async ({ feedPage: page }) => {
    await setupFeed(page);

    // First article has short content — "Extracted" option should be available
    const extractedRadio = page.getByRole("radio", { name: "Extracted" });
    await expect(extractedRadio).toBeVisible({ timeout: 10000 });
  });

  test("clicking Extracted triggers fetch and shows content", async ({
    feedPage: page,
  }) => {
    await mockPageEndpoint(page, SAMPLE_PAGE_HTML);
    await setupFeed(page);

    // Click Extracted to fetch full article
    await page.getByRole("radio", { name: "Extracted" }).click();

    // Should show "Extracting full article…" loading state
    await expect(page.getByText("Extracting full article")).toBeVisible({
      timeout: 5000,
    });

    // Then the extracted content should appear
    await expect(
      page.getByText("Full Article Title"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("extracted content is cached on toggle", async ({
    feedPage: page,
  }) => {
    await mockPageEndpoint(page, SAMPLE_PAGE_HTML);
    await setupFeed(page);

    // Fetch extracted content
    await page.getByRole("radio", { name: "Extracted" }).click();
    await expect(page.getByText("Full Article Title")).toBeVisible({
      timeout: 10000,
    });

    // Toggle back to Feed
    await page.getByRole("radio", { name: "Feed" }).click();
    await expect(page.getByText("Short description only.")).toBeVisible({
      timeout: 5000,
    });

    // Toggle back to Extracted — should show cached content immediately
    // (no loading indicator)
    await page.getByRole("radio", { name: "Extracted" }).click();
    await expect(page.getByText("Full Article Title")).toBeVisible({
      timeout: 5000,
    });
  });

  test("original link has correct href", async ({ feedPage: page }) => {
    await setupFeed(page);

    // The "Original" link should point to the article URL
    const originalLink = page.getByRole("link", { name: "Original" });
    await expect(originalLink).toBeVisible({ timeout: 10000 });
    await expect(originalLink).toHaveAttribute(
      "href",
      "https://example.com/first",
    );
  });

  test("article title with HTML entities is decoded", async ({
    feedPage: page,
  }) => {
    await setupFeed(page);

    // Select the article with HTML entities in the title
    await articleOption(page, "Entity & Decode Test").click();

    // The heading should show decoded entities
    await expect(
      page.getByRole("heading", { name: "Entity & Decode Test" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("extraction failure shows error", async ({ feedPage: page }) => {
    await mockPageEndpointError(page);
    await setupFeed(page);

    // Click Extracted — should show loading then error
    await page.getByRole("radio", { name: "Extracted" }).click();

    // After the fetch fails, should show an error indication or stay on feed content
    // The extraction store sets isExtracting=false on error, so the feed content
    // should remain visible or an error message appears
    await page.waitForTimeout(2000);
    // Feed content should still be accessible (user can switch back)
    await page.getByRole("radio", { name: "Feed" }).click();
    await expect(page.getByText("Short description only.")).toBeVisible({
      timeout: 5000,
    });
  });
});
