import { test, expect } from "@playwright/test";
import { skipOnboarding } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";

/**
 * Viewport resize tests: the sidebar must survive a desktop → mobile →
 * desktop transition without losing functionality. The old implementation
 * used two separate SidebarProvider trees that remounted on resize, wiping
 * the open/close state. The fix unifies them into one Provider whose
 * `open` prop is controlled and synced to the viewport.
 */
test.describe("Viewport resize", () => {
  test("sidebar is accessible after desktop → mobile → desktop resize", async ({
    page,
  }) => {
    await skipOnboarding(page);
    await mockFeedEndpoint(page, SAMPLE_RSS);

    // Start at desktop width — sidebar should be visible
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/feeds");
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading"),
      { timeout: 10000 },
    );

    // The desktop sidebar uses collapsible="none", which renders the outer
    // container with data-slot="sidebar" (the data-sidebar="sidebar"
    // attribute only appears in the collapsible="offcanvas" branch).
    const sidebar = page.locator('[data-slot="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    // Resize to mobile — desktop sidebar unmounts; the Vaul drawer takes over.
    await page.setViewportSize({ width: 393, height: 851 });
    await page.waitForTimeout(500); // let React re-render after breakpoint change

    // Resize back to desktop — sidebar must reappear
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(500);

    await expect(sidebar).toBeVisible({ timeout: 5000 });
  });

  test("three-panel desktop layout renders at the lg breakpoint (1024px)", async ({
    page,
  }) => {
    // PR F intentionally raised useIsDesktop to >=1024px (Tailwind `lg`) so
    // the narrow-viewport canvas-blank bug couldn't recur. Below 1024px the
    // mobile snap-scroll layout takes over. This test pins the threshold —
    // at exactly 1024px the desktop 3-panel layout must render.
    await skipOnboarding(page);
    await mockFeedEndpoint(page, SAMPLE_RSS);

    await page.setViewportSize({ width: 1024, height: 720 });
    await page.goto("/feeds");
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading"),
      { timeout: 10000 },
    );

    // Desktop layout: outer resizable panel group should be present.
    // .first() because the default route also renders an inner group
    // (article-list + reader) nested inside the stage panel.
    const panels = page
      .locator('[data-slot="resizable-panel-group"]')
      .first();
    await expect(panels).toBeVisible({ timeout: 5000 });

    // Persistent sidebar should be visible (no trigger needed to open it).
    // See the sibling test above for why data-slot, not data-sidebar.
    const sidebar = page.locator('[data-slot="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 5000 });
  });
});
