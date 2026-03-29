import { test, expect, addFeedViaUI, selectFeedInSidebar } from "./fixtures";
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
  await addFeedViaUI(page, "https://example.com/feed");
  await selectFeedInSidebar(page, "Test Feed");
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

    // First article has short content — "Full text" option should be available
    const fullTextToggle = page.getByRole("radio", { name: /Full text/ });
    await expect(fullTextToggle).toBeVisible({ timeout: 10000 });
  });

  test("clicking Full text triggers fetch and shows content", async ({
    feedPage: page,
  }) => {
    await mockPageEndpoint(page, SAMPLE_PAGE_HTML);
    await setupFeed(page);

    // Click Full text to fetch full article
    await page.getByRole("radio", { name: /Full text/ }).click();

    // The extracted content should appear (mock returns instantly, so loading
    // state may flash too fast to assert on)
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
    await page.getByRole("radio", { name: /Full text/ }).click();
    await expect(page.getByText("Full Article Title")).toBeVisible({
      timeout: 10000,
    });

    // Toggle back to Feed
    await page.getByRole("radio", { name: "Feed" }).click();
    await expect(page.getByText("Short description only.")).toBeVisible({
      timeout: 5000,
    });

    // Toggle back to Full text — should show cached content immediately
    // (no loading indicator)
    await page.getByRole("radio", { name: /Full text/ }).click();
    await expect(page.getByText("Full Article Title")).toBeVisible({
      timeout: 5000,
    });
  });

  test("original link has correct href", async ({ feedPage: page }) => {
    await setupFeed(page);

    // The "Original" is rendered as an <a> inside a ToggleGroupItem with asChild,
    // so it has role="radio" (from Radix) rather than role="link".
    const originalToggle = page.getByRole("radio", { name: /Original/ });
    await expect(originalToggle).toBeVisible({ timeout: 10000 });
    await expect(originalToggle).toHaveAttribute(
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

    // The auto-extract triggers in background for short content articles.
    // Since the mock returns 500, extraction fails and disables the Full text toggle.
    const fullTextToggle = page.getByRole("radio", { name: /Full text/ });
    await expect(fullTextToggle).toBeDisabled({ timeout: 10000 });

    // Feed content should still be visible despite extraction failure
    await expect(page.getByText("Short description only.")).toBeVisible({
      timeout: 5000,
    });
  });
});
