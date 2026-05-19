import { test, expect } from "@playwright/test";

test.describe("Onboarding", () => {
  test("new user auto-initializes and lands on Explore", async ({
    page,
  }) => {
    // Clear localStorage so the app starts fresh, but suppress changelog dialog
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("feedzero:last-seen-version", "0.2.1");
    });
    await page.goto("/feeds");

    // App auto-initializes (no onboarding modal) and redirects to /explore.
    // The redirect logic in feeds-page.tsx sends users with 0–1 feeds to
    // /explore (still in starter mode); the auto-subscribed release-notes
    // feed counts as one. /feeds/all kicks in once the user has 2+ feeds.
    await page.waitForURL(/\/explore/, { timeout: 15000 });
  });

  test("returning user skips onboarding and loads directly", async ({
    page,
  }) => {
    // Set onboarding as complete before navigating
    await page.addInitScript(() => {
      localStorage.setItem("feedzero:onboarding-complete", "true");
      localStorage.setItem("feedzero:storage-mode", "local");
      // Suppress changelog dialog
      localStorage.setItem("feedzero:last-seen-version", "0.2.1");
    });
    await page.goto("/feeds");

    // No dialog should appear
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5000 });
    // Returning user with 0–1 feeds also lands on /explore (see above).
    await page.waitForURL(/\/explore/, { timeout: 15000 });
  });

  test("no onboarding modal appears for new users", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      // Suppress changelog dialog to isolate the onboarding test
      localStorage.setItem("feedzero:last-seen-version", "0.2.1");
    });
    await page.goto("/feeds");

    // Wait for app initialization
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading"),
      { timeout: 15000 },
    );

    // No dialog should be visible — auto-initialization is silent
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5000 });

    // Fresh user lands on /explore (catalog), not /feeds/all.
    await page.waitForURL(/\/explore/, { timeout: 15000 });
  });
});
