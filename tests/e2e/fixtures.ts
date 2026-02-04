import { test as base, type Page } from "@playwright/test";

export { expect } from "@playwright/test";

/**
 * Sets localStorage keys so the app skips onboarding and boots to the feed list.
 * Must be called before navigating to any page.
 */
export async function skipOnboarding(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("feedzero:onboarding-complete", "true");
    localStorage.setItem("feedzero:storage-mode", "local");
  });
}

/**
 * Adds a feed via the sidebar UI. Assumes onboarding is already skipped
 * and the page is on /feeds.
 */
export async function addFeedViaUI(page: Page, url: string) {
  await page.getByRole("button", { name: "Add feed" }).click();
  await page.getByPlaceholder("Feed or site URL").fill(url);
  await page.getByRole("button", { name: "Add" }).click();
}

/**
 * Extended test fixture that provides a page with onboarding skipped
 * and the app loaded at /feeds.
 */
export const test = base.extend<{ feedPage: Page }>({
  feedPage: async ({ page }, use) => {
    await skipOnboarding(page);
    await page.goto("/feeds");
    // Wait for the app to finish loading — the "Loading…" text should disappear.
    // On desktop, "FeedZero" is in the sidebar. On mobile, the sidebar is collapsed.
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading"),
      { timeout: 10000 },
    );
    await use(page);
  },
});
