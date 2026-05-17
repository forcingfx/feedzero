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

    const sidebar = page.locator('[data-sidebar="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    // Resize to mobile — sidebar should hide (offcanvas)
    await page.setViewportSize({ width: 393, height: 851 });
    await page.waitForTimeout(500); // let React re-render after breakpoint change

    // Resize back to desktop — sidebar must reappear
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(500);

    await expect(sidebar).toBeVisible({ timeout: 5000 });
  });

  test("three-panel desktop layout renders at 900px (no gap zone)", async ({
    page,
  }) => {
    // useIsDesktop and useIsMobile both use 768px as their threshold, so
    // there is no gap zone. At 900px the full desktop 3-panel layout should
    // render with the persistent sidebar — no offcanvas trigger needed.
    await skipOnboarding(page);
    await mockFeedEndpoint(page, SAMPLE_RSS);

    await page.setViewportSize({ width: 900, height: 720 });
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

    // Persistent sidebar should be visible (no trigger needed to open it)
    const sidebar = page.locator('[data-sidebar="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 5000 });
  });
});
