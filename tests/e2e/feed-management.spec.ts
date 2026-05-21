import { test, expect, addFeedViaUI, selectFeedInSidebar } from "./fixtures";
import {
  SAMPLE_RSS,
  mockFeedEndpoint,
  mockFeedEndpointError,
  mockFeedEndpointHtml,
} from "./feed-fixtures";

test.describe("Feed management", () => {
  test("add feed via URL", async ({ feedPage: page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");
  });

  test("added feed is auto-selected and articles appear", async ({
    feedPage: page,
  }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");

    // Click the feed to select it
    await selectFeedInSidebar(page, "Test Feed");

    // Articles from the feed should appear in the article list
    await expect(
      page.locator('[role="option"]', { hasText: "First Article" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("feed title from parsed XML", async ({ feedPage: page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");
  });

  test("remove feed with confirmation", async ({ feedPage: page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");

    // Ensure the feed is selected so the context-aware settings pill renders.
    await selectFeedInSidebar(page, "Test Feed");

    // Open per-feed settings via the floating cog above the article list.
    await page.getByTestId("settings-pill").click();
    await page.getByTestId("feed-settings-delete").click();

    // Confirmation dialog should appear with the feed title in the body.
    await expect(page.getByText("Delete this feed?")).toBeVisible();
    await expect(page.getByText(/Test Feed.*cached article/)).toBeVisible();

    // Confirm removal
    await page.getByTestId("feed-settings-delete-confirm").click();

    // Feed should be gone
    await expect(
      page.locator('[data-sidebar="menu-button"]', { hasText: "Test Feed" }),
    ).toBeHidden({ timeout: 5000 });
  });

  test("cancel remove keeps feed", async ({ feedPage: page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");

    await selectFeedInSidebar(page, "Test Feed");

    await page.getByTestId("settings-pill").click();
    await page.getByTestId("feed-settings-delete").click();
    await page.getByTestId("feed-settings-delete-cancel").click();

    // Close the settings dialog so the sidebar is uncovered.
    await page.keyboard.press("Escape");

    // Feed should still be there
    await expect(
      page.locator('[data-sidebar="menu-button"]', { hasText: "Test Feed" }),
    ).toBeVisible();
  });

  test("invalid URL shows error", async ({ feedPage: page }) => {
    await mockFeedEndpointError(page);

    // Use a URL-like string so the Explore page recognizes it as a URL
    // (looksLikeUrl requires a dot or "://" to treat input as a URL)
    await addFeedViaUI(page, "https://not-a-real-feed.example");

    // Should show an error (toast or inline)
    const toast = page.locator("[data-sonner-toast][data-type='error']");
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test("non-feed URL shows error", async ({ feedPage: page }) => {
    await mockFeedEndpointHtml(page);
    await addFeedViaUI(page, "https://example.com");

    // Should show an error toast
    const toast = page.locator("[data-sonner-toast][data-type='error']");
    await expect(toast).toBeVisible({ timeout: 10000 });
  });
});
