import { test, expect } from "@playwright/test";
import { skipOnboarding, addFeedViaUI } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";

/**
 * Mobile navigation tests: scroll-snap panels with a floating back pill.
 *
 * On mobile, the article list and reader are adjacent scroll-snap panels.
 * Selecting an article scrolls to the reader panel. A floating pill at the
 * bottom scrolls back to the article list. Swiping right (native scroll-
 * snap) also navigates back.
 *
 * These tests only run on the mobile viewport.
 */
test.describe("Mobile navigation", () => {
  test.use({ viewport: { width: 393, height: 851 } }); // Pixel 5

  test("article list and reader both exist in the DOM when viewing an article", async ({
    page,
  }) => {
    // On mobile with scroll-snap, BOTH panels are in the DOM simultaneously
    // (not conditionally rendered based on URL). The scroll position
    // determines which panel is visible; both must exist for snap to work.
    await skipOnboarding(page);
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");

    // After the feed is added the user lands on the article list (mobile
    // does not auto-select the first article — the list is the destination,
    // not a transient state). Tap the first article to enter the reader.
    const articleListItem = page.locator('[role="option"]').first();
    await articleListItem.waitFor({ state: "visible", timeout: 10000 });
    await articleListItem.click();

    await expect(
      page.locator("article").first(),
    ).toBeVisible({ timeout: 10000 });

    // The article list (listbox) must ALSO be in the DOM, even though
    // the reader is the visible snap panel.
    await expect(
      page.locator('[role="listbox"]'),
    ).toBeAttached({ timeout: 5000 });
  });

  test("floating back pill appears when viewing an article", async ({
    page,
  }) => {
    await skipOnboarding(page);
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");

    // Tap the first article to enter the reader (mobile no longer auto-selects).
    const articleListItem = page.locator('[role="option"]').first();
    await articleListItem.waitFor({ state: "visible", timeout: 10000 });
    await articleListItem.click();

    // Wait for reader content
    await expect(
      page.locator("article").first(),
    ).toBeVisible({ timeout: 10000 });

    // The floating pill is a sticky/fixed element at the bottom,
    // distinct from the old inline "← Back" button that lived in the
    // main content flow.
    const backPill = page.locator('[data-testid="back-pill"]');
    await expect(backPill).toBeVisible({ timeout: 5000 });
  });

  test("tapping a feed lands on the article list, not the first article", async ({
    page,
  }) => {
    // The architectural bias toward single-article view on mobile is fixed:
    // selecting a feed should show the list, not skip into the reader.
    await skipOnboarding(page);
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");

    // URL must be /feeds/<id>, never /feeds/<id>/articles/<aid>.
    await page.waitForURL(/\/feeds\/[^/]+$/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/feeds\/[^/]+$/);

    // The article list is the visible mobile panel; the back pill is absent
    // because we are not in the reader.
    await expect(page.locator('[role="listbox"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="back-pill"]'),
    ).not.toBeVisible();
  });

  test("opening a new (unread) article shows it from the top, not mid-scroll", async ({
    page,
  }) => {
    // After scrolling deep into article A and swiping/clicking to article B,
    // article B must render at the top — not at the previous scroll offset.
    await skipOnboarding(page);
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");

    const items = page.locator('[role="option"]');
    await items.first().waitFor({ state: "visible", timeout: 10000 });
    await items.first().click();

    const readerScroll = page.locator('[data-testid="reader-scroll-mobile"]');
    await expect(readerScroll).toBeVisible({ timeout: 5000 });

    // Scroll the reader part-way down, then return to the list and pick another.
    await readerScroll.evaluate((el) => {
      el.scrollTop = 600;
    });
    await page.locator('[data-testid="back-pill"]').click();

    await items.nth(1).click();

    // The new article must start at top.
    await expect.poll(() =>
      readerScroll.evaluate((el) => el.scrollTop),
    ).toBe(0);
  });
  test("a quick rightward swipe on the reader slides it away and returns to the list", async ({
    page,
    browserName,
  }, testInfo) => {
    // CDP touch input runs through Chromium's touch-action handling, so
    // this catches a layer that lets the browser claim horizontal drags.
    // It is still not a finger: feel is verified on a real phone.
    test.skip(browserName !== "chromium", "CDP touch input is Chromium-only");
    await skipOnboarding(page);
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");

    const items = page.locator('[role="option"]');
    await items.first().waitFor({ state: "visible", timeout: 10000 });
    await items.first().click();
    const layer = page.locator('[data-testid="reader-layer"]');
    await expect(layer).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(400); // let the slide-in finish

    const cdp = await page.context().newCDPSession(page);
    const touch = (
      type: "touchStart" | "touchMove" | "touchEnd",
      x: number,
    ) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y: 400 }],
      });
    // A flick that ends short of the one-third distance rule (131px on
    // this 393px viewport), so only its speed can commit it. Moves are
    // paced (each CDP step takes ~50ms here, far slower than a real
    // 60Hz touchscreen), so the steps are wide enough to read as a flick
    // at ~600px/s.
    const moveTo = async (x: number) => {
      await touch("touchMove", x);
      await page.waitForTimeout(16);
    };
    await touch("touchStart", 120);
    await moveTo(135);
    await moveTo(150);
    await testInfo.attach("mid-swipe", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    // The screenshot paused the "finger". Motion measures release speed
    // over the last 100ms, so the flick runs longer than that.
    for (const x of [180, 210, 240]) await moveTo(x);
    await touch("touchEnd", 240);

    await expect(layer).toHaveCount(0, { timeout: 3000 });
    await expect(page).toHaveURL(/\/feeds\/[^/]+$/);
    await expect(page.locator('[role="listbox"]')).toBeVisible();
  });
});
