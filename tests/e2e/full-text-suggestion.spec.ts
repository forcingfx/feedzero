/**
 * Tapping "Full text" on a second article of the same feed offers to make
 * full text that feed's default (owner request, 2026-11). Accepting the
 * offer means the next article opens in full text with no tap.
 */
import { test, expect, addFeedViaUI, selectFeedInSidebar } from "./fixtures";
import {
  SAMPLE_RSS,
  SAMPLE_PAGE_HTML,
  mockFeedEndpoint,
  mockPageEndpoint,
} from "./feed-fixtures";

type Page = import("@playwright/test").Page;

/** Move to the next article: the list on desktop, the bottom bar on a phone. */
async function openNextArticle(page: Page, title: string) {
  const nextPill = page.getByTestId("next-pill");
  if (await nextPill.isVisible({ timeout: 1000 }).catch(() => false)) {
    await nextPill.click();
  } else {
    await page.locator('[role="option"]', { hasText: title }).click();
  }
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 10000 });
}

test.describe("Full text suggestion", () => {
  test("the second manual Full text on a feed offers to make it the default", async ({
    feedPage: page,
  }) => {
    await mockPageEndpoint(page, SAMPLE_PAGE_HTML);
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");
    await selectFeedInSidebar(page, "Test Feed");
    await page.locator('[role="option"]', { hasText: "First Article" }).click();

    const offer = page.getByText("Always open Test Feed in full text?");

    await page.getByRole("button", { name: /Full text/ }).click();
    await expect(page.getByText("Full Article Title")).toBeVisible({ timeout: 10000 });
    await expect(offer).toBeHidden();

    await openNextArticle(page, "Second Article");
    await page.getByRole("button", { name: /Full text/ }).click();
    await expect(offer).toBeVisible({ timeout: 5000 });
    if (process.env.SHOT_DIR) {
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${process.env.SHOT_DIR}/offer-${test.info().project.name}.png` });
    }

    await page.getByRole("button", { name: "Always" }).click();
    await expect(page.getByText("Test Feed now opens in full text")).toBeVisible({
      timeout: 5000,
    });

    // The setting took: the third article arrives in full text untouched.
    await openNextArticle(page, "Third Article");
    await expect(page.getByText("Full Article Title")).toBeVisible({ timeout: 10000 });
  });
});
