import { test, expect, addFeedViaUI } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";
import type { Page } from "@playwright/test";

/**
 * Navigate to the Settings → Sync & Data tab where the sync controls live.
 *
 * Settings is a stage page at /settings, the tab is called "Sync & Data",
 * and the primary sync affordance is a <Switch> toggle. We anchor on the
 * Danger zone heading because it's always rendered regardless of hosted /
 * self-hosted state — the Cloud sync card's heading is aria-hidden in the
 * self-host-gated path, so anchoring on Danger zone keeps this helper
 * robust across both modes.
 *
 * Desktop puts Settings in the sidebar menu; mobile puts it in the
 * always-visible dock as an icon button carrying only an aria-label. The
 * previous "open the drawer and look for a menu-button" path found nothing
 * there, which is what kept the mobile sync specs red.
 */
async function goToSyncSection(page: Page) {
  const settingsBtn = page
    .locator('[data-sidebar="menu-button"]', { hasText: "Settings" })
    .or(page.getByRole("button", { name: "Settings", exact: true }))
    .first();
  await settingsBtn.waitFor({ state: "visible", timeout: 10000 });

  await settingsBtn.click();
  await page.waitForURL(/\/settings/, { timeout: 5000 });

  // Switch to the Sync & Data tab if the page didn't open straight onto it.
  await page.getByRole("radio", { name: /sync and data/i }).click();
  await page.waitForURL(/\/settings\?tab=sync-and-data/, { timeout: 5000 });
  // Always-visible anchor — see the helper docstring on why this is NOT
  // the Cloud sync heading.
  await expect(
    page.getByRole("heading", { name: /danger zone/i }),
  ).toBeVisible({ timeout: 5000 });
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
  test("clicking the sidebar Settings button navigates to /settings", async ({
    feedPage: page,
  }) => {
    // Desktop puts Settings in the sidebar menu; mobile puts it in the
    // always-visible dock as an icon button (aria-label only), so the old
    // "open the drawer and look for a menu-button" path found nothing.
    const settingsBtn = page
      .locator('[data-sidebar="menu-button"]', { hasText: "Settings" })
      .or(page.getByRole("button", { name: "Settings", exact: true }))
      .first();
    await settingsBtn.waitFor({ state: "visible", timeout: 10000 });
    await settingsBtn.click();
    await page.waitForURL(/\/settings/, { timeout: 5000 });
  });

  test("delete all data: confirm closes the dialog and clears feeds", async ({
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

    // resetApp() clears the DB and drops the user back into onboarding. The
    // deterministic post-reset signal is that welcome dialog appearing, plus
    // the previously-added Test Feed being gone.
    //
    // This used to assert `getByRole("dialog")` became hidden, which cannot
    // hold: the confirm dialog closes but the onboarding dialog opens in its
    // place, so the generic role query keeps matching.
    await expect(
      page.getByRole("dialog", { name: /welcome to feedzero/i }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator('[data-sidebar="menu-button"]', { hasText: "Test Feed" }),
    ).toHaveCount(0, { timeout: 5000 });
  });
});
