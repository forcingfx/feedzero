import { test, expect } from "./fixtures";
import { SIGNAL_CORPUS_GATE } from "../../src/core/signal/types";

test.describe("Signal — sidebar + locked state", () => {
  test("sidebar Sparkles entry navigates to /signal", async ({ feedPage: page }) => {
    // Desktop: the sidebar row. Mobile: the Signal tab in the bottom bar.
    // Both carry data-testid sidebar-signal-link.
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
