/**
 * Settings must not scroll sideways on a phone (owner report,
 * 2026-11-20). Six tabs are wider than the screen; the tab strip scrolls
 * inside itself and the page stays put. Real layout, so this is E2E:
 * happy-dom computes no widths.
 */
import { test, expect } from "./fixtures";

const TABS = ["reading", "list", "library", "sync-and-data", "subscription", "help"];

test.describe("Settings on a phone", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 1024, "Phone layout only");

  for (const tab of TABS) {
    test(`the ${tab} tab does not make the page scroll sideways`, async ({ feedPage: page }) => {
      await page.goto(`/settings?tab=${tab}`);
      await page.getByRole("radio", { name: "Reading" }).waitFor({ timeout: 15000 });

      const overflow = await page.evaluate(() => {
        const scroller = document.querySelector("main")!;
        return {
          page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          main: scroller.scrollWidth - scroller.clientWidth,
        };
      });

      expect(overflow.page, "document overflows sideways").toBeLessThanOrEqual(0);
      expect(overflow.main, "settings scroller overflows sideways").toBeLessThanOrEqual(0);
    });
  }

  test("the tab strip scrolls inside itself to reach the last tab", async ({ feedPage: page }) => {
    await page.goto("/settings");
    const help = page.getByRole("radio", { name: "Help" });
    await help.scrollIntoViewIfNeeded();
    await expect(help).toBeInViewport();
    await help.click();
    await expect(page).toHaveURL(/tab=help/);
  });
});

/**
 * Leaving Settings and coming back lands on the same screen: the same
 * tab, scrolled to the same place (owner request, 2026-11-20). Scroll
 * needs real layout, so it is checked here.
 */
test.describe("Returning to Settings", () => {
  test("reopens the tab and the scroll position the user left", async ({ feedPage: page }) => {
    const isPhone = (page.viewportSize()?.width ?? 1280) < 1024;
    await page.goto("/settings");
    await page.getByRole("radio", { name: "List" }).click();
    await expect(page.getByTestId("list-tab")).toBeVisible();

    const scrollTop = () =>
      page.evaluate(() => {
        const page = document.querySelector('[data-testid="list-tab"]')!;
        return page.closest<HTMLElement>("[data-radix-scroll-area-viewport], main")!.scrollTop;
      });
    await page.getByRole("switch", { name: "Group article floods" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const leftAt = await scrollTop();
    test.skip(leftAt === 0, "The List tab fits this viewport without scrolling");

    // Away and back the way a person does it: through the app's own nav.
    if (isPhone) {
      const tabs = page.getByTestId("drawer-handle-strip");
      await tabs.getByRole("button", { name: /^Explore|show all tabs/ }).first().click();
      if (!/\/explore/.test(page.url())) await tabs.getByRole("button", { name: "Explore" }).click();
      await page.waitForURL(/\/explore/);
      await tabs.getByRole("button", { name: "Settings" }).click();
    } else {
      await page.getByRole("button", { name: /explore/i }).first().click();
      await page.waitForURL(/\/explore/);
      await page.getByRole("button", { name: /^settings$/i }).first().click();
    }

    await expect(page).toHaveURL(/tab=list/);
    await expect(page.getByTestId("list-tab")).toBeVisible();
    await expect.poll(scrollTop).toBe(leftAt);
  });
});
