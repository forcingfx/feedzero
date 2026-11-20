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
