/**
 * The phone tab bar's Feeds tab (owner request, 2026-11-19): from another
 * section it returns to the feed list last seen; tapped again, now that
 * Feeds is the current tab, it opens the feed list drawer.
 */
import { test, expect, addFeedViaUI, selectFeedInSidebar } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";

test.describe("Feeds tab", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 1024, "Phone tab bar only");

  test("first tap returns to the last feed list, second tap opens the drawer", async ({
    feedPage: page,
  }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");
    await selectFeedInSidebar(page, "Test Feed");
    await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 10000 });
    const feedListUrl = page.url();

    const tabs = page.getByTestId("drawer-handle-strip");
    await tabs.getByRole("button", { name: "Settings" }).click();
    await page.waitForURL(/\/settings/);

    await tabs.getByRole("button", { name: "Feeds", exact: true }).click();
    await expect(page).toHaveURL(feedListUrl);
    await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("drawer-content")).toBeHidden();

    await tabs.getByRole("button", { name: "Feeds, open feed list" }).click();
    await expect(page.getByTestId("drawer-content")).toBeVisible();
  });
});
