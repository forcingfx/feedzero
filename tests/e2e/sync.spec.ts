import { test, expect, addFeedViaUI } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";
import type { Page } from "@playwright/test";

/**
 * Navigate to the Settings → Sync & Data tab where the sync controls live.
 *
 * Post-redesign: Settings is a stage page at /settings, the tab is called
 * "Sync & Data", and the primary sync affordance is a <Switch> toggle (not
 * the prior "Enable sync" / "Use existing cloud account" buttons).
 *
 * On mobile, the sidebar Settings button is inside the bottom drawer which
 * we open first.
 */
async function goToSyncSection(page: Page) {
  const settingsBtn = page.locator('[data-sidebar="menu-button"]', {
    hasText: "Settings",
  });
  if (!(await settingsBtn.isVisible())) {
    // Mobile: settings is inside the bottom drawer.
    const drawerHandle = page.getByRole("button", { name: /open feed list/i });
    if (await drawerHandle.isVisible()) {
      await drawerHandle.click();
    } else {
      const sidebarTrigger = page
        .getByRole("main")
        .getByRole("button", { name: /toggle sidebar/i });
      await sidebarTrigger.click();
    }
    await settingsBtn.waitFor({ state: "visible", timeout: 5000 });
  }

  await settingsBtn.click();
  await page.waitForURL(/\/settings/, { timeout: 5000 });

  // Switch to the Sync & Data tab if the page didn't open straight onto it.
  await page.getByRole("radio", { name: /sync and data/i }).click();
  await page.waitForURL(/\/settings\?tab=sync-and-data/, { timeout: 5000 });
  await expect(page.getByRole("heading", { name: /cloud sync/i })).toBeVisible({
    timeout: 5000,
  });
}

async function addFeedForSync(page: Page) {
  await mockFeedEndpoint(page, SAMPLE_RSS);
  await addFeedViaUI(page, "https://example.com/feed");
  await page.waitForURL(/\/feeds\//, { timeout: 10000 });
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({
    timeout: 10000,
  });
}

test.describe("Sync", () => {
  test("Sync & Data tab shows the Cloud sync section + local-only status", async ({
    feedPage: page,
  }) => {
    await addFeedForSync(page);
    await goToSyncSection(page);
    await expect(
      page.getByRole("heading", { name: /cloud sync/i }),
    ).toBeVisible();
    // Free-tier hosted users see the upgrade overlay rather than the
    // local-only status — assert the gate is present.
    await expect(
      page.getByText(/cloud sync requires a subscription/i),
    ).toBeVisible();
  });

  test("clicking the sidebar Settings button navigates to /settings", async ({
    feedPage: page,
  }) => {
    const settingsBtn = page.locator('[data-sidebar="menu-button"]', {
      hasText: "Settings",
    });
    if (!(await settingsBtn.isVisible())) {
      const drawerHandle = page.getByRole("button", { name: /open feed list/i });
      if (await drawerHandle.isVisible()) {
        await drawerHandle.click();
      }
      await settingsBtn.waitFor({ state: "visible", timeout: 5000 });
    }
    await settingsBtn.click();
    await page.waitForURL(/\/settings/, { timeout: 5000 });
  });

  test("delete all data: confirm → resets to All items article list", async ({
    feedPage: page,
  }) => {
    await addFeedForSync(page);
    await goToSyncSection(page);

    await page
      .getByRole("button", { name: /delete all data and reset app/i })
      .click();

    const confirm = page.getByRole("dialog");
    await expect(
      confirm.getByText(/delete all data and reset app\?/i),
    ).toBeVisible({ timeout: 5000 });
    await confirm.getByRole("button", { name: /delete everything/i }).click();

    // After reset: auto-init lands the user on /feeds/all (the post-reset
    // default).
    await page.waitForURL(/\/feeds\/all/, { timeout: 15000 });
  });
});
