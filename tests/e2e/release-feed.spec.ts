import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { openSidebar, skipOnboarding } from "./fixtures";

/**
 * E2E test for the first-launch auto-subscribe flow.
 *
 * When a returning user has zero feeds (fresh DB), the app automatically
 * subscribes them to the FeedZero release notes feed at CHANGELOG_FEED_URL.
 * This test verifies the full integration: app init → auto-subscribe fires →
 * proxy fetch intercepted → feed parsed → sidebar shows the release feed.
 *
 * The /api/feed proxy is mocked with the vendored fixture BEFORE navigation
 * so the auto-subscribe request is caught. Without that ordering, the request
 * races past the mock and silently fails (try/catch swallows it), giving a
 * false-green test that doesn't actually exercise the flow.
 */
const releaseFixture = readFileSync(
  new URL("../fixtures/release-feed.xml", import.meta.url),
  "utf-8",
);

test.describe("Release notes auto-subscribe", () => {
  test("first-launch subscribes to release notes and shows it in sidebar", async ({
    page,
  }) => {
    // Bypass onboarding — simulate a healthy returning local user with an
    // empty DB (flag + stored derived keys; flag alone means "keys lost"
    // and re-onboards). Deliberately NOT the feedPage fixture: this test
    // needs the auto-subscribe request to go through, not be blocked.
    await skipOnboarding(page);

    // Mock the feed proxy BEFORE navigating so the auto-subscribe request
    // (POST /api/feed with body {"url":"https://feedzero.app/releases.xml"})
    // is intercepted and answered with the vendored fixture.
    await page.route("**/api/feed*", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/xml",
        body: releaseFixture,
      });
    });

    const autoSubscribe = page.waitForResponse("**/api/feed*", { timeout: 15000 });
    await page.goto("/feeds");

    // Wait for the auto-subscribe request itself. This used to wait for
    // the feed's name in the phone's header breadcrumb; the header bar is
    // gone, and with a single feed the app sits on Explore, which names
    // no feed. The sidebar assertion below is the user-visible outcome.
    await autoSubscribe;

    // On mobile the feed list is a vaul drawer. This used to click the
    // legacy [data-sidebar="trigger"], which no longer exists, so the
    // assertion below ran against a closed drawer.
    await openSidebar(page);

    const releaseFeedButton = page.locator('[data-sidebar="menu-button"]', {
      hasText: "FeedZero Release Notes",
    });
    await expect(releaseFeedButton).toBeVisible({ timeout: 10000 });
  });
});
