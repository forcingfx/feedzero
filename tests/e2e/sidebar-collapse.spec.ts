/**
 * Collapsing the desktop feed list, in a real browser.
 *
 * The unit test (tests/components/layout/sidebar-collapse.test.tsx) can
 * only assert that the sidebar leaves the a11y tree — happy-dom has no
 * layout, so it cannot tell a 256px panel from a 0px one, and the whole
 * point of the feature is the reclaimed width. That assertion belongs
 * here.
 *
 * Desktop-only: mobile puts the feed list in a drawer, which is already
 * "collapsed" by construction.
 */
import { test, expect, addFeedViaUI, selectFeedInSidebar } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";

async function sidebarWidth(page: import("@playwright/test").Page) {
  const box = await page.locator('[data-panel][id="sidebar"]').boundingBox();
  return Math.round(box?.width ?? 0);
}

test.describe("Desktop sidebar collapse", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 1024, "Desktop only");

  test("the toggle reclaims the sidebar's width and gives it back", async ({
    feedPage: page,
  }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");
    await selectFeedInSidebar(page, "Test Feed");

    expect(await sidebarWidth(page)).toBeGreaterThan(100);

    await page.getByRole("button", { name: "Hide feed list" }).click();
    await expect
      .poll(() => sidebarWidth(page), {
        message: "collapsing must actually reclaim the width",
      })
      .toBe(0);

    await page.getByRole("button", { name: "Show feed list" }).click();
    await expect
      .poll(() => sidebarWidth(page))
      .toBeGreaterThan(100);
  });

  test("the collapsed state survives a reload", async ({ feedPage: page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");
    await selectFeedInSidebar(page, "Test Feed");

    await page.getByRole("button", { name: "Hide feed list" }).click();
    await expect.poll(() => sidebarWidth(page)).toBe(0);

    await page.reload();

    // A collapse that undoes itself on every refresh is not an option the
    // user can actually take.
    await expect(
      page.getByRole("button", { name: "Show feed list" }),
    ).toBeVisible();
    await expect.poll(() => sidebarWidth(page)).toBe(0);
  });

  test("restores the width the user chose, not the default", async ({
    feedPage: page,
  }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");
    await selectFeedInSidebar(page, "Test Feed");

    const handle = page.locator('[data-slot="resizable-handle"]').first();
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error("resize handle had no bounding box");
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBox.x + 20,
      handleBox.y + handleBox.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();

    const chosen = await sidebarWidth(page);
    expect(chosen).toBeGreaterThan(100);

    await page.getByRole("button", { name: "Hide feed list" }).click();
    await expect.poll(() => sidebarWidth(page)).toBe(0);
    await page.getByRole("button", { name: "Show feed list" }).click();

    // The collapsed 0px must never be persisted as "the user's width".
    await expect.poll(() => sidebarWidth(page)).toBe(chosen);
  });
});
