import { test, expect } from "./fixtures";
import {
  SAMPLE_RSS,
  SAMPLE_RSS_UPDATED,
  mockFeedEndpoint,
} from "./feed-fixtures";

/** Scoped selector for an article in the list. */
function articleOption(page: import("@playwright/test").Page, text: string) {
  return page.locator('[role="option"]', { hasText: text });
}

test.describe("Feed refresh", () => {
  test("refresh all updates feeds with new articles", async ({
    feedPage: page,
  }) => {
    // Use a mutable reference so we can swap the response
    let feedResponse = SAMPLE_RSS;
    await page.route("**/api/feed*", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/xml",
        body: feedResponse,
      });
    });

    // Add feed with initial RSS
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

    // Switch the response to updated RSS with a new article
    feedResponse = SAMPLE_RSS_UPDATED;

    // Click refresh all
    await page.getByRole("button", { name: "Refresh all feeds" }).click();
    await page.waitForTimeout(2000);

    // After refresh, articles in DB are updated but the article store
    // doesn't auto-reload. Navigate away and back to trigger loadArticles.
    await page.goto("/feeds");
    await page.getByText("Test Feed").click();

    // New article should appear
    await expect(articleOption(page, "Brand New Article")).toBeVisible({
      timeout: 10000,
    });
  });

  test("refresh shows spinner", async ({ feedPage: page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await page.getByRole("button", { name: "Add feed" }).click();
    await page
      .getByPlaceholder("Feed or site URL")
      .fill("https://example.com/feed");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Test Feed")).toBeVisible({ timeout: 10000 });

    // Add a delay to the feed response so we can observe the spinner
    await page.unroute("**/api/feed*");
    await page.route("**/api/feed*", async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      route.fulfill({
        status: 200,
        contentType: "text/xml",
        body: SAMPLE_RSS,
      });
    });

    // Click refresh
    await page.getByRole("button", { name: "Refresh all feeds" }).click();

    // Refresh button should be disabled during refresh
    await expect(
      page.getByRole("button", { name: "Refresh all feeds" }),
    ).toBeDisabled({ timeout: 2000 });

    // The icon inside the button should have animate-spin
    const svg = page
      .getByRole("button", { name: "Refresh all feeds" })
      .locator("svg");
    await expect(svg).toHaveClass(/animate-spin/, { timeout: 2000 });
  });

  test("duplicate articles not added on refresh", async ({
    feedPage: page,
  }) => {
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

    // Count articles before refresh
    const countBefore = await page.locator('[role="option"]').count();

    // Refresh with the same feed content
    await page.getByRole("button", { name: "Refresh all feeds" }).click();
    await page.waitForTimeout(2000);

    // Count after refresh — should be the same (no duplicates)
    const countAfter = await page.locator('[role="option"]').count();
    expect(countAfter).toBe(countBefore);
  });
});
