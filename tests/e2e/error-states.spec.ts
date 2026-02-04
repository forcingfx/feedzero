import { test, expect } from "./fixtures";
import {
  mockFeedEndpointError,
  mockFeedEndpointHtml,
  mockPageEndpointError,
  SAMPLE_RSS,
  mockFeedEndpoint,
} from "./feed-fixtures";

/** Scoped selector for an article in the list. */
function articleOption(page: import("@playwright/test").Page, text: string) {
  return page.locator('[role="option"]', { hasText: text });
}

test.describe("Error states", () => {
  test("network error on feed add shows error toast", async ({
    feedPage: page,
  }) => {
    await mockFeedEndpointError(page);

    await page.getByRole("button", { name: "Add feed" }).click();
    await page
      .getByPlaceholder("Feed or site URL")
      .fill("https://example.com/feed");
    await page.getByRole("button", { name: "Add" }).click();

    // Should show an error toast
    const toast = page.locator("[data-sonner-toast][data-type='error']");
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test("non-feed URL shows error toast", async ({ feedPage: page }) => {
    await mockFeedEndpointHtml(page);

    await page.getByRole("button", { name: "Add feed" }).click();
    await page
      .getByPlaceholder("Feed or site URL")
      .fill("https://example.com/page");
    await page.getByRole("button", { name: "Add" }).click();

    // Should show an error toast indicating it's not a valid feed
    const toast = page.locator("[data-sonner-toast][data-type='error']");
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test("extraction failure falls back gracefully", async ({
    feedPage: page,
  }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await mockPageEndpointError(page);

    // Add feed and select it
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

    // Try to extract — should fail
    await page.getByRole("radio", { name: "Extracted" }).click();
    await page.waitForTimeout(2000);

    // Should be able to fall back to feed content
    await page.getByRole("radio", { name: "Feed" }).click();
    await expect(page.getByText("Short description only.")).toBeVisible({
      timeout: 5000,
    });
  });
});
