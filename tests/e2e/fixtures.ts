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
 * Block the first-launch release-notes auto-subscribe so a fresh DB stays
 * empty by default. Must be registered BEFORE navigation so the auto-subscribe
 * POST /api/feed (body {"url":"https://feedzero.app/releases.xml"}) is
 * intercepted before it races past us to the dev-server proxy.
 *
 * Tests that explicitly mock /api/feed via `mockFeedEndpoint` add their own
 * route that also 404s the release-notes URL — those overlay this one and
 * still work correctly. Tests that need the auto-subscribe to succeed (e.g.
 * release-feed.spec.ts) opt out by not using the feedPage fixture.
 */
export async function blockReleaseAutoSubscribe(page: Page) {
  await page.route("**/api/feed*", async (route) => {
    let targetUrl = "";
    try {
      const body = route.request().postData();
      if (body) targetUrl = JSON.parse(body)?.url ?? "";
    } catch {
      /* fall through to fallback */
    }
    if (targetUrl.includes("releases.xml")) {
      await route.fulfill({ status: 404, body: "release-notes blocked in test" });
      return;
    }
    await route.fallback();
  });
}

/**
 * Adds a feed via the Explore page search input.
 * Navigates to /explore, pastes the URL, and submits.
 */
export async function addFeedViaUI(page: Page, url: string) {
  await page.goto("/explore");
  await page.waitForFunction(
    () => !document.body.textContent?.includes("Loading"),
    { timeout: 10000 },
  );
  const searchInput = page.getByPlaceholder("Search feeds or paste a URL...");
  await searchInput.fill(url);
  await searchInput.press("Enter");
  // Wait for the feed to be added — either success toast or sidebar button
  await page
    .locator("[data-sonner-toast]")
    .or(
      page
        .locator('[data-sidebar="menu-button"]')
        .filter({ hasNotText: /Explore|All items/ }),
    )
    .first()
    .waitFor({ timeout: 15000 });
}

/**
 * Selects a feed in the sidebar. On mobile, opens the sidebar first.
 */
export async function selectFeedInSidebar(page: Page, feedName: string) {
  const feedButton = page.locator('[data-sidebar="menu-button"]', {
    hasText: feedName,
  });
  if (!(await feedButton.isVisible({ timeout: 1000 }).catch(() => false))) {
    const trigger = page.locator('[data-sidebar="trigger"]');
    if (await trigger.isVisible({ timeout: 1000 }).catch(() => false)) {
      await trigger.click();
    }
  }
  await feedButton.waitFor({ state: "visible", timeout: 10000 });
  // Force click — sidebar buttons have CSS transitions that Playwright
  // considers "not stable", causing actionability timeouts
  await feedButton.click({ force: true });
}

/**
 * Extended test fixture that provides a page with onboarding skipped
 * and the app loaded at /feeds.
 */
export const test = base.extend<{ feedPage: Page }>({
  feedPage: async ({ page }, use) => {
    await skipOnboarding(page);
    await blockReleaseAutoSubscribe(page);
    await page.goto("/feeds");
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading"),
      { timeout: 10000 },
    );
    await use(page);
  },
});
