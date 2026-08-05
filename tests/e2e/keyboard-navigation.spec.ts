import { test, expect, addFeedViaUI, selectFeedInSidebar } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";

/** Scoped selector for an article in the list. */
function articleOption(page: import("@playwright/test").Page, text: string) {
  return page.locator('[role="option"]', { hasText: text });
}

/**
 * Adds a feed, selects it, opens the first article in the reader.
 * Works on both desktop and mobile (mobile no longer auto-selects).
 */
async function setupFeed(page: import("@playwright/test").Page) {
  await mockFeedEndpoint(page, SAMPLE_RSS);
  await addFeedViaUI(page, "https://example.com/feed");
  await selectFeedInSidebar(page, "Test Feed");
  const firstArticle = articleOption(page, "First Article");
  await expect(firstArticle).toBeVisible({ timeout: 10000 });
  // Deliberately NOT { force: true }: forcing also skips the pointer-events
  // check, so on mobile the click can land on the still-closing nav drawer
  // and silently do nothing, leaving the reader empty. Observed while fixing
  // the flake below — the cure was worse than the disease.
  await firstArticle.click();
  await expect(
    page.getByRole("heading", { name: "First Article" }),
  ).toBeVisible({ timeout: 10000 });
}

test.describe("Keyboard navigation", () => {
  test("j opens next article", async ({ feedPage: page }) => {
    await setupFeed(page);

    // First article is auto-selected, reader shows it
    await expect(
      page.getByRole("heading", { name: "First Article" }),
    ).toBeVisible({ timeout: 10000 });

    // Press j to open next article
    await page.keyboard.press("j");

    // Reader should show the second article content
    await expect(
      page.getByText("Brief summary of the second article"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("k opens previous article", async ({ feedPage: page }) => {
    await setupFeed(page);

    // First article is auto-selected
    await expect(
      page.getByRole("heading", { name: "First Article" }),
    ).toBeVisible({ timeout: 10000 });

    // Press j to go to second article
    await page.keyboard.press("j");
    await expect(
      page.getByText("Brief summary of the second article"),
    ).toBeVisible({ timeout: 10000 });

    // Press k to go back to first article
    await page.keyboard.press("k");

    // Reader should show the first article again
    await expect(
      page.getByRole("heading", { name: "First Article" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("keys are ignored in input fields", async ({ feedPage: page }) => {
    await setupFeed(page);

    // Navigate to explore page where the search input lives
    await page.goto("/explore");
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading"),
      { timeout: 10000 },
    );
    const input = page.getByPlaceholder("Search feeds or paste a URL...");
    await input.focus();

    // Type 'j' — should go into input, not navigate articles
    await page.keyboard.press("j");
    await expect(input).toHaveValue("j");
  });

  test("j/k stay at boundaries", async ({ feedPage: page }) => {
    await setupFeed(page);

    // First article is auto-selected
    await expect(
      page.getByRole("heading", { name: "First Article" }),
    ).toBeVisible({ timeout: 10000 });

    // Press k — should stay at first (can't go before first)
    await page.keyboard.press("k");

    // Should still show first article
    await expect(
      page.getByRole("heading", { name: "First Article" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("o opens original link in new tab", async ({ feedPage: page }) => {
    await setupFeed(page);

    // setupFeed already selected the first article and waited for its
    // heading; clicking it again here was redundant and was the source of a
    // CI flake (the row is already aria-selected, and the re-click waited on
    // a colour transition that never settled).

    // Press o — should open the original link
    const popupPromise = page.waitForEvent("popup");
    await page.keyboard.press("o");
    const popup = await popupPromise;
    expect(popup.url()).toContain("example.com/first");
  });

  test("n navigates to explore page", async ({ feedPage: page }) => {
    await setupFeed(page);

    // Press n
    await page.keyboard.press("n");

    // Should navigate to explore page with search input
    await expect(page.getByPlaceholder("Search feeds or paste a URL...")).toBeVisible({
      timeout: 5000,
    });
  });
});
