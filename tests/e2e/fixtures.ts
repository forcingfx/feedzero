import { test as base, type Page } from "@playwright/test";

export { expect } from "@playwright/test";

/**
 * Deterministic TEST-ONLY key material (structurally identical to what
 * `deriveAndStoreKeys` persists). Publicly committed on purpose: these
 * keys only ever encrypt throwaway E2E fixture data inside an ephemeral
 * browser context. Never reuse outside tests.
 *
 * Why the fixture needs keys at all: since the derived-keys boot FSM,
 * `onboarding-complete=true` alone describes a returning user whose
 * keys were LOST — `restore()` reports `no-keys` and the app correctly
 * re-onboards. A skipped onboarding must look like a *healthy*
 * returning user: flag + stored keys. The boot canary (`getFeeds`)
 * passes trivially against the fresh empty DB these keys create.
 */
const E2E_DERIVED_KEYS = {
  dbKeyJwk: {
    key_ops: ["encrypt", "decrypt"],
    ext: true,
    alg: "A256GCM",
    kty: "oct",
    k: "uufadNILu9haiuTZpAV7KkAyLaSplHksqAq3ZWo6zzQ",
  },
  hmacKeyJwk: {
    key_ops: ["sign", "verify"],
    ext: true,
    alg: "HS256",
    kty: "oct",
    k: "DrC9QNFuBcHuGblZ8MbRyEQ9ajnQqxOf2ikaSSg4D-5YSxxPRXnnDSWPl-kxdB8jMh1Uzlq2wgtliTOOWf23iA",
  },
  dbSalt: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
};

/**
 * Sets localStorage keys so the app skips onboarding and boots to the feed list
 * as a healthy returning local-only user (flag + stored derived keys).
 * Must be called before navigating to any page.
 */
export async function skipOnboarding(page: Page) {
  await page.addInitScript((keys) => {
    localStorage.setItem("feedzero:onboarding-complete", "true");
    localStorage.setItem("feedzero:storage-mode", "local");
    localStorage.setItem("feedzero:derived-keys", JSON.stringify(keys));
  }, E2E_DERIVED_KEYS);
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
  // Explore is a lazy route: the "Loading" probe above can pass while the
  // chunk is still resolving, so wait for the input itself before typing.
  const searchInput = page.getByPlaceholder("Search feeds or paste a URL...");
  await searchInput.waitFor({ state: "visible", timeout: 15000 });
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
 * Selects a feed in the sidebar. On mobile the feed list lives in the
 * bottom drawer, so open that first.
 *
 * The old `[data-sidebar="trigger"]` fallback was dead: mobile replaced
 * the offcanvas sidebar with the vaul drawer (feature 010), so every
 * mobile-project spec that switched feeds silently timed out. That is
 * most of what kept the mobile half of the suite red.
 */
export async function selectFeedInSidebar(page: Page, feedName: string) {
  const feedButton = page.locator('[data-sidebar="menu-button"]', {
    hasText: feedName,
  });
  if (!(await feedButton.isVisible({ timeout: 1000 }).catch(() => false))) {
    const drawerTrigger = page.getByRole("button", {
      name: /open feed list/i,
    });
    if (await drawerTrigger.isVisible({ timeout: 1000 }).catch(() => false)) {
      await drawerTrigger.click();
      // vaul slides the drawer up; clicking mid-animation resolves the
      // feed button while it is still off-viewport. Wait for the panel
      // to land before reaching into it.
      await page
        .locator('[data-testid="drawer-content"][data-state="open"]')
        .waitFor({ state: "visible", timeout: 10000 })
        .catch(() => {});
      await page.waitForTimeout(350);
    } else {
      const legacyTrigger = page.locator('[data-sidebar="trigger"]');
      if (await legacyTrigger.isVisible({ timeout: 1000 }).catch(() => false)) {
        await legacyTrigger.click();
      }
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
