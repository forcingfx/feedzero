/**
 * Regression guard for ADR 013 (stable outer panel topology).
 *
 * Feedback issue #97 reported: "The panel listing all of the feeds &
 * folders [resets] after I extend it to its max width & click on the
 * Explore tab after reading an article. This also happens vice-versa."
 *
 * PR I + ADR 013 made the outer ResizablePanelGroup constant across all
 * routes so the persisted size survives navigation. This spec exercises
 * the exact route sequence from the report: a feed route → Explore →
 * a feed route, capturing the sidebar width at each step. If a future
 * refactor breaks the topology, this fails loudly.
 *
 * Desktop-only — mobile collapses the sidebar entirely so the invariant
 * doesn't apply.
 */
import { test, expect, addFeedViaUI, selectFeedInSidebar } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";

async function sidebarWidth(page: import("@playwright/test").Page) {
  // react-resizable-panels renders each Panel as <div data-panel id="<id>">.
  // Only the outer group has a panel with id="sidebar"; the inner stage
  // group's panels are id="article-list" and "reader". No need to scope.
  const sidebar = page.locator('[data-panel][id="sidebar"]');
  await expect(sidebar).toBeVisible();
  const box = await sidebar.boundingBox();
  if (!box) throw new Error("sidebar panel had no bounding box");
  return Math.round(box.width);
}

test.describe("Sidebar width stability across routes (ADR 013)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 1024, "Desktop only");

  test("sidebar width survives Feed → Explore → Feed navigation", async ({ page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");
    await selectFeedInSidebar(page, "Test Feed");

    const startingWidth = await sidebarWidth(page);
    // Make the sidebar a different size than the default so we can detect
    // a "reset to default" regression. Drag is preferable to a synthetic
    // setSize because it exercises the real persistence path.
    // The outer group's resize handle sits between [sidebar] and [stage].
    // Our wrapper marks separators with data-slot="resizable-handle" — the
    // inner stage group adds its own handle, so .first() picks the outer one.
    const handle = page
      .locator('[data-slot="resizable-handle"]')
      .first();
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error("resize handle had no bounding box");
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + 120, handleBox.y + handleBox.height / 2, { steps: 8 });
    await page.mouse.up();

    const widened = await sidebarWidth(page);
    expect(widened, "drag should actually change the sidebar width").not.toBe(startingWidth);

    await page.getByRole("link", { name: /explore/i }).first().click();
    await page.waitForURL(/\/explore/);
    const afterExplore = await sidebarWidth(page);
    expect(afterExplore, "navigating to /explore must not reset sidebar width").toBe(widened);

    await selectFeedInSidebar(page, "Test Feed");
    const afterReturn = await sidebarWidth(page);
    expect(afterReturn, "navigating back to a feed must not reset sidebar width").toBe(widened);
  });
});
