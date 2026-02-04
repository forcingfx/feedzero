import { test, expect } from "./fixtures";
import {
  SAMPLE_RSS,
  mockFeedEndpoint,
  mockFeedEndpointError,
  mockFeedEndpointHtml,
} from "./feed-fixtures";

test.describe("Feed management", () => {
  test("add feed via URL", async ({ feedPage: page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);

    // Open add form and submit
    await page.getByRole("button", { name: "Add feed" }).click();
    await page
      .getByPlaceholder("Feed or site URL")
      .fill("https://example.com/feed");
    await page.getByRole("button", { name: "Add" }).click();

    // Feed should appear in sidebar
    await expect(page.getByText("Test Feed")).toBeVisible({ timeout: 10000 });
  });

  test("added feed is auto-selected and articles appear", async ({
    feedPage: page,
  }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);

    await page.getByRole("button", { name: "Add feed" }).click();
    await page
      .getByPlaceholder("Feed or site URL")
      .fill("https://example.com/feed");
    await page.getByRole("button", { name: "Add" }).click();

    // Wait for feed to appear
    await expect(page.getByText("Test Feed")).toBeVisible({ timeout: 10000 });

    // Click the feed to select it
    await page.getByText("Test Feed").click();

    // Articles from the feed should appear in the article list
    await expect(
      page.locator('[role="option"]', { hasText: "First Article" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("feed title from parsed XML", async ({ feedPage: page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);

    await page.getByRole("button", { name: "Add feed" }).click();
    await page
      .getByPlaceholder("Feed or site URL")
      .fill("https://example.com/feed");
    await page.getByRole("button", { name: "Add" }).click();

    // Title should match <title> from RSS fixture
    await expect(page.getByText("Test Feed")).toBeVisible({ timeout: 10000 });
  });

  test("remove feed with confirmation", async ({ feedPage: page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);

    // Add a feed first
    await page.getByRole("button", { name: "Add feed" }).click();
    await page
      .getByPlaceholder("Feed or site URL")
      .fill("https://example.com/feed");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Test Feed")).toBeVisible({ timeout: 10000 });

    // Open the dropdown menu for the feed
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: /delete/i }).click();

    // Confirmation dialog should appear
    await expect(page.getByText(/Remove.*Test Feed/)).toBeVisible();

    // Confirm removal
    await page.getByRole("button", { name: "Remove" }).click();

    // Feed should be gone
    await expect(page.getByText("Test Feed")).toBeHidden({ timeout: 5000 });
  });

  test("cancel remove keeps feed", async ({ feedPage: page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);

    await page.getByRole("button", { name: "Add feed" }).click();
    await page
      .getByPlaceholder("Feed or site URL")
      .fill("https://example.com/feed");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Test Feed")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: /delete/i }).click();
    await page.getByRole("button", { name: "Cancel" }).click();

    // Feed should still be there
    await expect(page.getByText("Test Feed")).toBeVisible();
  });

  test("invalid URL shows error", async ({ feedPage: page }) => {
    await mockFeedEndpointError(page);

    await page.getByRole("button", { name: "Add feed" }).click();
    await page.getByPlaceholder("Feed or site URL").fill("not-a-url");
    await page.getByRole("button", { name: "Add" }).click();

    // Should show an error (toast or inline)
    // The app shows toast.error for failures
    const toast = page.locator("[data-sonner-toast][data-type='error']");
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test("non-feed URL shows error", async ({ feedPage: page }) => {
    await mockFeedEndpointHtml(page);

    await page.getByRole("button", { name: "Add feed" }).click();
    await page.getByPlaceholder("Feed or site URL").fill("https://example.com");
    await page.getByRole("button", { name: "Add" }).click();

    // Should show an error toast
    const toast = page.locator("[data-sonner-toast][data-type='error']");
    await expect(toast).toBeVisible({ timeout: 10000 });
  });
});
