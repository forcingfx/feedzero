/**
 * E2E: bulk-import a URL list where one URL is rate-limited by the
 * upstream. The failing URL must:
 *   1. appear in the sidebar as a placeholder feed (so the user doesn't
 *      have to manually re-add it),
 *   2. show the red failed-feed indicator,
 *   3. recover when the user refreshes after the upstream is reachable.
 *
 * Covers the issue #117 follow-up: "feed URLs fail to be imported due
 * to rate limiting — import them even if they fail, and allow the user
 * to retry fetching the feed(s) later via the refresh button or the
 * 'r' key."
 */
import { test, expect } from "./fixtures";
import { SAMPLE_RSS, readTargetUrlFromBody } from "./feed-fixtures";

const URL_LIST = `https://ok.example.com/feed
https://rate-limited.example.com/feed`;

test.describe("Import recovery — placeholder for rate-limited URLs", () => {
  test("creates a placeholder, surfaces the error indicator, and recovers on refresh", async ({
    feedPage: page,
  }) => {
    // Phase 1: ok.* succeeds with SAMPLE_RSS; rate-limited.* returns 429.
    // The release-notes auto-subscribe still has to 404 the way the
    // feed-fixtures helper does it, otherwise it lands as a duplicate.
    let phase: "rate-limited" | "recovered" = "rate-limited";
    await page.route("**/api/feed*", (route) => {
      const targetUrl = readTargetUrlFromBody(route.request().postData());
      // Parse the target URL so we can match on hostname precisely.
      // `url.includes("rate-limited.example.com")` was flagged by
      // CodeQL's js/incomplete-url-substring-sanitization rule — and
      // even outside the rule's intent (this is a test mock, not a
      // security boundary), precise matching is the right shape.
      let targetHost = "";
      try {
        targetHost = new URL(targetUrl).hostname;
      } catch {
        // Non-URL body — fall through to the catch-all 200 fixture.
      }
      if (targetUrl.includes("releases.xml")) {
        route.fulfill({ status: 404, body: "blocked in test" });
        return;
      }
      if (targetHost === "rate-limited.example.com") {
        if (phase === "rate-limited") {
          route.fulfill({
            status: 429,
            headers: { "retry-after": "60" },
            body: "Too Many Requests",
          });
          return;
        }
        route.fulfill({
          status: 200,
          contentType: "text/xml",
          body: SAMPLE_RSS.replace(/Test Feed/g, "Rate-Limited Feed"),
        });
        return;
      }
      route.fulfill({
        status: 200,
        contentType: "text/xml",
        body: SAMPLE_RSS,
      });
    });

    // Navigate to Settings → Data and paste the URL list.
    await page.goto("/explore");
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading"),
      { timeout: 10000 },
    );
    await page.getByRole("button", { name: "Import / Export" }).click();
    await page.waitForURL(/\/settings\?tab=sync-and-data/);
    await page.getByRole("radio", { name: "Paste text" }).click();
    await page
      .getByPlaceholder(
        "Paste OPML XML, Pocket HTML export, or feed URLs (one per line)",
      )
      .fill(URL_LIST);
    await page.getByRole("button", { name: "Import feeds" }).click();

    // Results summary shows the 3-bucket breakdown: 1 added, 1 queued.
    await expect(
      page.getByText(/1 feed added.*1 queued for retry/i),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Queued for retry/i)).toBeVisible();

    // Both feeds — the OK one and the placeholder — landed in the sidebar.
    // Navigate to /feeds and assert.
    await page.getByRole("button", { name: "Done" }).click();
    await page.goto("/feeds");

    // Placeholder sidebar label is the URL host because metadata hasn't
    // been fetched yet. The OK feed shows its parsed <title>.
    await expect(page.getByText("Test Feed")).toBeVisible();
    await expect(page.getByText("rate-limited.example.com")).toBeVisible();

    // The placeholder carries the red failed-feed indicator.
    const failedIndicator = page.getByTestId("failed-feed-indicator");
    await expect(failedIndicator).toHaveCount(1);

    // Phase 2: flip the mock so rate-limited.* now returns 200. Hit "r"
    // to refresh all feeds. The placeholder upgrades in place: indicator
    // clears, title backfills.
    phase = "recovered";
    await page.keyboard.press("r");

    await expect(page.getByText("Rate-Limited Feed")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId("failed-feed-indicator")).toHaveCount(0);
  });
});
