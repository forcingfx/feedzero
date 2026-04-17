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

  test("sidebar works when resizing through the 768-1024px gap zone", async ({
    page,
  }) => {
    // FeedsPage switches at 1024px (useIsDesktop), SidebarProvider at
    // 768px (useIsMobile). Between 768-1024px the mobile layout renders
    // but SidebarProvider thinks it's desktop. The sidebar trigger should
    // still open the sidebar at any width below 1024px.
    await skipOnboarding(page);
    await mockFeedEndpoint(page, SAMPLE_RSS);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/feeds");
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading"),
      { timeout: 10000 },
    );

    // Resize to the gap zone: 900px (below 1024 = mobile layout, above 768 = SidebarProvider thinks desktop)
    await page.setViewportSize({ width: 900, height: 720 });
    await page.waitForTimeout(500);

    // The sidebar trigger should exist in the mobile layout
    const trigger = page.locator('[data-sidebar="trigger"]');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Clicking the trigger should open the sidebar
    await trigger.click();
    const sidebar = page.locator('[data-sidebar="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    // Close sidebar and resize back to desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(500);

    // Sidebar should reappear as the persistent desktop sidebar
    await expect(sidebar).toBeVisible({ timeout: 5000 });
  });
});
