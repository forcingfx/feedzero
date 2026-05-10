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

/**
 * Adds a feed, selects it, and opens the first article in the reader.
 * Works on both desktop and mobile: desktop auto-selects the first article;
 * mobile lands on the list, so we tap the first article ourselves.
 */
async function setupFeed(page: import("@playwright/test").Page) {
  await mockFeedEndpoint(page, SAMPLE_RSS);
  await addFeedViaUI(page, "https://example.com/feed");
  await selectFeedInSidebar(page, "Test Feed");
  const firstArticle = articleOption(page, "First Article");
  await expect(firstArticle).toBeVisible({ timeout: 10000 });
  // Tap the first article. On desktop this is a no-op if it was auto-selected,
  // but the click is idempotent. On mobile this opens the reader.
  await firstArticle.click();
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
    const fullTextToggle = page.getByRole("button", { name: /Full text/ });
    await expect(fullTextToggle).toBeVisible({ timeout: 10000 });
  });

  test("clicking Full text triggers fetch and shows content", async ({
    feedPage: page,
  }) => {
    await mockPageEndpoint(page, SAMPLE_PAGE_HTML);
    await setupFeed(page);

    // Click Full text to fetch full article
    await page.getByRole("button", { name: /Full text/ }).click();

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
    await page.getByRole("button", { name: /Full text/ }).click();
    await expect(page.getByText("Full Article Title")).toBeVisible({
      timeout: 10000,
    });

    // Toggle back to Feed.
    // exact:true so we match the view-toggle button labelled "Feed", not
    // the sidebar feed button labelled "Test Feed" (substring match would
    // resolve to two elements and Playwright fails strict-mode).
    await page.getByRole("button", { name: "Feed", exact: true }).click();
    await expect(page.getByText("Short description only.")).toBeVisible({
      timeout: 5000,
    });

    // Toggle back to Full text — should show cached content immediately
    // (no loading indicator)
    await page.getByRole("button", { name: /Full text/ }).click();
    await expect(page.getByText("Full Article Title")).toBeVisible({
      timeout: 5000,
    });
  });

  test("article title is a link to the original URL", async ({ feedPage: page }) => {
    await setupFeed(page);

    // The article title is rendered as an <a> linking to the original article.
    const titleLink = page.getByRole("link", { name: /First Article/ });
    await expect(titleLink).toBeVisible({ timeout: 10000 });
    await expect(titleLink).toHaveAttribute("href", "https://example.com/first");
    await expect(titleLink).toHaveAttribute("target", "_blank");
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
    const fullTextToggle = page.getByRole("button", { name: /Full text/ });
    await expect(fullTextToggle).toBeDisabled({ timeout: 10000 });

    // Feed content should still be visible despite extraction failure
    await expect(page.getByText("Short description only.")).toBeVisible({
      timeout: 5000,
    });
  });
});
