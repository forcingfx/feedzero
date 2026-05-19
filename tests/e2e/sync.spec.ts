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
 * IMPORTANT: in e2e the default tier is `free` and the build is hosted, so
 * the Cloud sync card mounts with the frosted-glass gate overlay. The
 * gate wraps its content in `aria-hidden=true` so screen readers focus on
 * the upgrade CTA rather than the blurred toggle. That means the
 * "Cloud sync" <h3> is unreachable via Playwright's `getByRole`
 * (which filters out aria-hidden) when this helper runs. We wait on the
 * Danger zone heading instead — it's a sibling card, always rendered,
 * never aria-hidden, so it's a reliable signal that the Sync & Data tab
 * has actually mounted.
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
  test("Sync & Data tab gates the cloud sync toggle for free-tier hosted users", async ({
    feedPage: page,
  }) => {
    await addFeedForSync(page);
    await goToSyncSection(page);
    // The Cloud sync card content is aria-hidden behind the frosted-glass
    // gate; the user-visible state is the overlay's headline. Asserting on
    // the overlay text (not the hidden heading) matches what the user
    // actually sees and what they can interact with.
    await expect(
      page.getByText(/cloud sync requires a subscription/i),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /upgrade plan/i }),
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

    // resetApp() doesn't navigate — it just clears the DB and re-onboards
    // silently. The deterministic post-reset signal is the dialog closing,
    // and the previously-added Test Feed no longer appearing in the sidebar.
    await expect(confirm).toBeHidden({ timeout: 15000 });
    await expect(
      page.locator('[data-sidebar="menu-button"]', { hasText: "Test Feed" }),
    ).toHaveCount(0, { timeout: 5000 });
  });
});
