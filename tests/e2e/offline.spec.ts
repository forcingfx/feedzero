import type { Page } from "@playwright/test";
import { test, expect, addFeedViaUI, selectFeedInSidebar } from "./fixtures";
import { mockFeedEndpoint, SAMPLE_RSS } from "./feed-fixtures";

/**
 * The landing page promises "Loaded articles stay readable without a
 * connection." Articles have always been on the device; the app that shows
 * them was not, so closing the tab offline lost access to all of it. This
 * spec is that promise, exercised the way a reader would: subscribe, lose
 * the connection, reopen.
 *
 * It runs against a production build (the `offline` project in
 * playwright.config.ts), because the dev server ships no service worker.
 */

/**
 * Resolves once the app can be reopened offline: a worker is active and has
 * stored the app page.
 *
 * It deliberately does not wait for the worker to control the *current*
 * page. A page that was already loading while the worker activated is never
 * claimed (seen about one run in ten here), and that is harmless: what
 * matters offline is the next navigation, which an active worker handles
 * whether or not it controls the page that came before.
 *
 * Polls from the test side. `page.waitForFunction` with an async predicate
 * treats the returned Promise itself as truthy and passes immediately, which
 * let an earlier version of this check "succeed" against a site with no
 * worker at all.
 */
async function waitForOfflineReady(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker?.getRegistration();
          if (!registration) return "no service worker registered";
          if (registration.active?.state !== "activated") {
            const worker = registration.installing ?? registration.waiting;
            return `worker is ${worker?.state ?? "gone"}, not active yet`;
          }
          const names = await caches.keys();
          if (names.length === 0) return "no cache yet";
          const cache = await caches.open(names[0]);
          const hasPage = (await cache.match("/index.html")) !== undefined;
          return hasPage ? "ready" : `cache ${names[0]} has no app page`;
        }),
      { timeout: 25_000 },
    )
    .toBe("ready");
}

test.describe("offline", () => {
  test("reopening the app with no connection shows a feed added earlier", async ({
    feedPage: page,
    context,
  }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed.xml");
    await waitForOfflineReady(page);

    await context.setOffline(true);
    await page.goto("/feeds");

    await selectFeedInSidebar(page, "Test Feed");
    await expect(page.getByText("First Article").first()).toBeVisible();
  });

  test("a deep link opens offline, not only the start page", async ({
    feedPage: page,
    context,
  }) => {
    await waitForOfflineReady(page);

    await context.setOffline(true);
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });
});
