import { test, expect } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";

/** Scoped selector for an article in the list. */
function articleOption(page: import("@playwright/test").Page, text: string) {
  return page.locator('[role="option"]', { hasText: text });
}

/** Adds a feed, selects it, and waits for articles to load. */
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

test.describe("Keyboard navigation", () => {
  test("j moves focus to next article", async ({ feedPage: page }) => {
    await setupFeed(page);

    // Focus the first article item
    await articleOption(page, "First Article").focus();

    // Press j to move down
    await page.keyboard.press("j");

    // Second article should now be focused
    const focused = page.locator('[role="option"]:focus');
    await expect(focused).toContainText("Second Article");
  });

  test("k moves focus to previous article", async ({ feedPage: page }) => {
    await setupFeed(page);

    // Focus the second article
    await articleOption(page, "Second Article").focus();

    // Press k to move up
    await page.keyboard.press("k");

    // First article should now be focused
    const focused = page.locator('[role="option"]:focus');
    await expect(focused).toContainText("First Article");
  });

  test("Enter activates focused article", async ({ feedPage: page }) => {
    await setupFeed(page);

    // Focus the second article
    await articleOption(page, "Second Article").focus();

    // Press Enter to select it
    await page.keyboard.press("Enter");

    // Reader should show the second article content
    await expect(
      page.getByText("Brief summary of the second article"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("Escape returns focus to list", async ({ feedPage: page }) => {
    await setupFeed(page);

    // Click a non-list element to move focus away
    await page.getByRole("heading", { name: "First Article" }).click();

    // Press Escape to return focus to list
    await page.keyboard.press("Escape");

    // Focus should be on a list option
    const focused = page.locator('[role="option"]:focus');
    await expect(focused).toBeVisible({ timeout: 5000 });
  });

  test("keys are ignored in input fields", async ({ feedPage: page }) => {
    await setupFeed(page);

    // Open add feed form
    await page.getByRole("button", { name: "Add feed" }).click();
    const input = page.getByPlaceholder("Feed or site URL");
    await input.focus();

    // Type 'j' — should go into input, not navigate articles
    await page.keyboard.press("j");
    await expect(input).toHaveValue("j");
  });

  test("j/k stay at boundaries", async ({ feedPage: page }) => {
    await setupFeed(page);

    // Focus the first article
    await articleOption(page, "First Article").focus();

    // Press k — should stay at first (can't go before first)
    await page.keyboard.press("k");
    const focused = page.locator('[role="option"]:focus');
    await expect(focused).toContainText("First Article");
  });
});
