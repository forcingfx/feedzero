/**
 * A collapsed sidebar folder stays collapsed across a reload.
 *
 * User report (2026-11): "I like to have them all collapsed. But on every
 * reload they are open again." Collapse state lived only in memory. The
 * store's unit tests cover the storage round trip; this covers the real
 * boot path, where hydration could put the folder back to open.
 *
 * Desktop only: the folder is created from the sidebar's Add menu, and
 * the persistence path is the same store on both layouts.
 */
import { test, expect, addFeedViaUI } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";

test.describe("Folder collapse persistence", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 1024, "Desktop only");

  test("a collapsed folder is still collapsed after a reload", async ({
    feedPage: page,
  }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");

    await page
      .locator('[data-panel][id="sidebar"]')
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "New folder" }).click();
    await page.getByPlaceholder("Folder name").fill("News");
    await page.getByPlaceholder("Folder name").press("Enter");

    const toggle = page.getByRole("button", { name: "Toggle folder" });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await page.reload();

    await expect(page.getByRole("button", { name: "Toggle folder" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
