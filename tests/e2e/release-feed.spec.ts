import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { skipOnboarding } from "./fixtures";

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

    await page.goto("/feeds");

    // Wait for auto-subscribe to complete. The feed name appears in the
    // breadcrumb on both desktop and mobile once the feed-store selects it,
    // even before the sidebar is opened on mobile.
    await expect(
      page.locator("text=FeedZero Release Notes"),
    ).toBeVisible({ timeout: 15000 });

    // On mobile the sidebar is offcanvas — open it to verify the feed button.
    const trigger = page.locator('[data-sidebar="trigger"]');
    if (await trigger.isVisible({ timeout: 1000 }).catch(() => false)) {
      await trigger.click();
    }

    const releaseFeedButton = page.locator('[data-sidebar="menu-button"]', {
      hasText: "FeedZero Release Notes",
    });
    await expect(releaseFeedButton).toBeVisible({ timeout: 10000 });
  });
});
