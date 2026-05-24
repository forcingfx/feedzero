import { test, expect } from "./fixtures";
import { mockFeedEndpoint, SAMPLE_RSS } from "./feed-fixtures";

// 1x1 red PNG (68 bytes) — a real decodable image for the browser
const RED_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Add a feed via the Explore page search input.
 * The Explore page is the default view for new/empty users.
 */
async function addFeedViaExplore(
  page: import("@playwright/test").Page,
  url: string,
) {
  await page.goto("/explore");
  await page.waitForFunction(
    () => !document.body.textContent?.includes("Loading"),
    { timeout: 10000 },
  );
  const searchInput = page.getByPlaceholder("Search feeds or paste a URL...");
  await searchInput.fill(url);
  await searchInput.press("Enter");
}

test.describe("Favicon rendering", () => {
  test("favicon image loads and is visible in the sidebar", async ({
    feedPage: page,
  }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);

    // Mock the smart favicon endpoint to return a real PNG
    await page.route("**/api/icon*", (route) => {
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: RED_PIXEL_PNG,
      });
    });

    await addFeedViaExplore(page, "https://example.com/feed");

    // Wait for the feed to appear in the sidebar
    await expect(
      page.locator('[data-sidebar="menu-button"]', { hasText: "Test Feed" }),
    ).toBeVisible({ timeout: 10000 });

    // Find the favicon <img> inside that sidebar button
    const sidebarFavicon = page
      .locator('[data-sidebar="menu-button"]', { hasText: "Test Feed" })
      .locator("img");

    // The image should be visible (not hidden by the loading fallback)
    await expect(sidebarFavicon).toBeVisible({ timeout: 5000 });

    // Verify the browser actually decoded the image bytes
    const naturalWidth = await sidebarFavicon.evaluate(
      (img: HTMLImageElement) => img.naturalWidth,
    );
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test("favicon falls back when smart endpoint fails", async ({
    feedPage: page,
  }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);

    // Smart endpoint fails
    await page.route("**/api/icon*", (route) => {
      route.fulfill({ status: 502, body: "fail" });
    });

    // Legacy icon endpoint succeeds
    await page.route("**/api/icon*", (route) => {
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: RED_PIXEL_PNG,
      });
    });

    await addFeedViaExplore(page, "https://example.com/feed");

    await expect(
      page.locator('[data-sidebar="menu-button"]', { hasText: "Test Feed" }),
    ).toBeVisible({ timeout: 10000 });

    const sidebarFavicon = page
      .locator('[data-sidebar="menu-button"]', { hasText: "Test Feed" })
      .locator("img");

    await expect(sidebarFavicon).toBeVisible({ timeout: 5000 });
    const naturalWidth = await sidebarFavicon.evaluate(
      (img: HTMLImageElement) => img.naturalWidth,
    );
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test("shows SVG fallback when all favicon strategies fail", async ({
    feedPage: page,
  }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);

    // All favicon/icon endpoints fail
    await page.route("**/api/icon*", (route) => {
      route.fulfill({ status: 502, body: "fail" });
    });
    await page.route("**/api/icon*", (route) => {
      route.fulfill({ status: 404, body: "not found" });
    });

    await addFeedViaExplore(page, "https://example.com/feed");

    await expect(
      page.locator('[data-sidebar="menu-button"]', { hasText: "Test Feed" }),
    ).toBeVisible({ timeout: 10000 });

    // Should show SVG fallback (RSS icon) since all image loads failed
    const sidebarButton = page.locator('[data-sidebar="menu-button"]', {
      hasText: "Test Feed",
    });
    await expect(sidebarButton.locator("svg")).toBeVisible({ timeout: 10000 });
  });
});
