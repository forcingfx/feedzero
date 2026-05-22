import { test, expect } from "./fixtures";
import { SIGNAL_CORPUS_GATE } from "../../src/core/signal/types";

test.describe("Signal — sidebar + locked state", () => {
  test("sidebar Sparkles entry navigates to /signal", async ({ feedPage: page }) => {
    // Desktop: sidebar entry is visible inline. Mobile: drawer must be opened
    // first. Either way the button has data-testid sidebar-signal-link.
    const isMobile = page.viewportSize() && page.viewportSize()!.width < 768;
    if (isMobile) {
      const drawerHandle = page.getByRole("button", { name: /Menu|Drawer|Open/i }).first();
      if (await drawerHandle.isVisible().catch(() => false)) {
        await drawerHandle.click();
      }
    }
    const signalLink = page.getByTestId("sidebar-signal-link").first();
    await expect(signalLink).toBeVisible({ timeout: 10000 });
    await signalLink.click();
    await expect(page).toHaveURL(/\/signal$/);
  });

  test("locked tile renders when the corpus is below the gate", async ({ feedPage: page }) => {
    await page.goto("/signal");
    // Default fresh app has zero articles; signal goes straight to locked.
    await expect(page.getByText(/more articles to unlock/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(`0 of ${SIGNAL_CORPUS_GATE} articles in your store`)).toBeVisible();
  });
});
