import { test, expect } from "./fixtures";

test.describe("Public stats dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/catalog?action=popular*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          feeds: [
            {
              url: "https://news.ycombinator.com/rss",
              title: "Hacker News",
              description: null,
              siteUrl: "https://news.ycombinator.com",
              status: "active",
              requestCount: 1234,
              lastRequestedAt: "2026-05-02T00:00:00Z",
              lastCrawledAt: null,
              errorCount: 0,
              lastError: null,
              createdAt: "2026-01-01T00:00:00Z",
            },
            {
              url: "https://example.com/rss",
              title: "Niche Blog",
              description: null,
              siteUrl: "https://example.com",
              status: "active",
              requestCount: 3,
              lastRequestedAt: "2026-05-02T00:00:00Z",
              lastCrawledAt: null,
              errorCount: 0,
              lastError: null,
              createdAt: "2026-01-01T00:00:00Z",
            },
          ],
        }),
      }),
    );
    await page.route("**/api/catalog?action=count", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, count: 2415 }),
      }),
    );
    await page.route("**/api/stats-sync*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, vaults: 87, lastUpdatedAt: null }),
      }),
    );
  });

  test("renders headline counts and the leaderboard", async ({ feedPage: page }) => {
    await page.goto("/stats");
    await expect(page.getByText(/FeedZero stats/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("stat-vaults")).toHaveText(/87/);
    await expect(page.getByTestId("stat-feeds")).toHaveText(/2,?415/);
    await expect(page.getByText("Hacker News")).toBeVisible();
    // Long tail: counts under 5 are intentionally shown.
    await expect(page.getByText("Niche Blog")).toBeVisible();
    await expect(page.getByText("3", { exact: true })).toBeVisible();
  });
});
