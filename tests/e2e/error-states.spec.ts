import { test, expect, addFeedViaUI, selectFeedInSidebar } from "./fixtures";
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

    await addFeedViaUI(page, "https://example.com/feed");

    // Should show an error toast
    const toast = page.locator("[data-sonner-toast][data-type='error']");
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test("non-feed URL shows error toast", async ({ feedPage: page }) => {
    await mockFeedEndpointHtml(page);

    await addFeedViaUI(page, "https://example.com/page");

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
    await addFeedViaUI(page, "https://example.com/feed");
    await selectFeedInSidebar(page, "Test Feed");
    await expect(articleOption(page, "First Article")).toBeVisible({
      timeout: 10000,
    });

    // The auto-extract triggers in background for short content articles.
    // Since the mock returns 500, extraction fails and disables the Full text toggle.
    const fullTextToggle = page.getByRole("button", { name: /Full text/ });
    await expect(fullTextToggle).toBeDisabled({ timeout: 10000 });

    // Feed content should still be visible despite extraction failure
    await expect(page.getByText("Short description only.")).toBeVisible({
      timeout: 5000,
    });
  });
});
