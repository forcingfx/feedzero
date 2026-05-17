import { test, expect, addFeedViaUI } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";
import type { Page } from "@playwright/test";

/**
 * Navigate to the Settings → Data tab where the sync controls live.
 *
 * After PR A-B, Settings is a stage page at /settings (not a modal) and
 * the sync section lives on the Data tab. On mobile, the sidebar Settings
 * button is inside the bottom drawer which we open first.
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

  // Switch to the Data tab if the page didn't open straight onto it.
  await page.getByRole("radio", { name: /^data$/i }).click();
  await page.waitForURL(/\/settings\?tab=data/, { timeout: 5000 });
  await expect(page.getByRole("heading", { name: /cloud sync/i })).toBeVisible({
    timeout: 5000,
  });
}

/** A locator scoping queries to the Cloud sync card on the Data tab. */
function syncCard(page: Page) {
  return page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: /cloud sync/i }) })
    .first();
}

/**
 * Helper to add a feed so the sync flow has something to encrypt. Works
 * on both desktop and mobile.
 */
async function addFeedForSync(page: Page) {
  await mockFeedEndpoint(page, SAMPLE_RSS);
  await addFeedViaUI(page, "https://example.com/feed");
  await page.waitForURL(/\/feeds\//, { timeout: 10000 });
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 10000 });
}

test.describe("Sync", () => {
  test.describe("existing cloud account flow", () => {
    test("shows 'Use existing cloud account' button for local-only users", async ({
      feedPage: page,
    }) => {
      await addFeedForSync(page);
      await goToSyncSection(page);
      await expect(
        page.getByRole("button", { name: "Use existing cloud account" }),
      ).toBeVisible();
    });

    test("clicking 'Use existing cloud account' shows passphrase entry", async ({
      feedPage: page,
    }) => {
      await addFeedForSync(page);
      await goToSyncSection(page);
      await page
        .getByRole("button", { name: "Use existing cloud account" })
        .click();

      // ExistingCloudFlow is still a Radix Dialog; portal it.
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await expect(
        dialog.getByPlaceholder("Enter your passphrase"),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Connect" }),
      ).toBeVisible();
    });

    test("connect button is disabled when passphrase is empty", async ({
      feedPage: page,
    }) => {
      await addFeedForSync(page);
      await goToSyncSection(page);
      await page
        .getByRole("button", { name: "Use existing cloud account" })
        .click();

      const dialog = page.getByRole("dialog");
      const connectBtn = dialog.getByRole("button", { name: "Connect" });
      await expect(connectBtn).toBeDisabled();
    });

    test("connect button is enabled when passphrase is entered", async ({
      feedPage: page,
    }) => {
      await addFeedForSync(page);
      await goToSyncSection(page);
      await page
        .getByRole("button", { name: "Use existing cloud account" })
        .click();

      const dialog = page.getByRole("dialog");
      await dialog
        .getByPlaceholder("Enter your passphrase")
        .fill("test-passphrase");

      const connectBtn = dialog.getByRole("button", { name: "Connect" });
      await expect(connectBtn).toBeEnabled();
    });

    test("cancel returns to status view (sync card on Data tab)", async ({
      feedPage: page,
    }) => {
      await addFeedForSync(page);
      await goToSyncSection(page);
      await page
        .getByRole("button", { name: "Use existing cloud account" })
        .click();

      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByPlaceholder("Enter your passphrase"),
      ).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();

      // Dialog closes; we're back on the Data tab with the Enable sync
      // affordance visible in the sync card.
      await expect(dialog).toBeHidden({ timeout: 5000 });
      await expect(
        syncCard(page).getByRole("button", { name: "Enable sync" }),
      ).toBeVisible();
    });

    test("shows error when cloud account not found", async ({
      feedPage: page,
    }) => {
      await addFeedForSync(page);
      await goToSyncSection(page);
      await page
        .getByRole("button", { name: "Use existing cloud account" })
        .click();

      const dialog = page.getByRole("dialog");
      await dialog
        .getByPlaceholder("Enter your passphrase")
        .fill("nonexistent-passphrase-test");
      await dialog.getByRole("button", { name: "Connect" }).click();

      await expect(dialog.getByText("Could not connect")).toBeVisible({
        timeout: 10000,
      });
      await expect(
        dialog.getByRole("button", { name: "Try again" }),
      ).toBeVisible();
    });

    test("try again returns to passphrase entry", async ({
      feedPage: page,
    }) => {
      await addFeedForSync(page);
      await goToSyncSection(page);
      await page
        .getByRole("button", { name: "Use existing cloud account" })
        .click();

      const dialog = page.getByRole("dialog");
      await dialog
        .getByPlaceholder("Enter your passphrase")
        .fill("nonexistent-passphrase-test");
      await dialog.getByRole("button", { name: "Connect" }).click();

      await expect(dialog.getByText("Could not connect")).toBeVisible({
        timeout: 10000,
      });
      await dialog.getByRole("button", { name: "Try again" }).click();
      await expect(
        dialog.getByPlaceholder("Enter your passphrase"),
      ).toBeVisible();
    });
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

  test("Data tab shows the Cloud sync section + local-only status", async ({
    feedPage: page,
  }) => {
    await addFeedForSync(page);
    await goToSyncSection(page);
    await expect(
      page.getByRole("heading", { name: /cloud sync/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/your data is stored locally in this browser only/i),
    ).toBeVisible();
  });

  test("enable sync shows passphrase in setup dialog", async ({
    feedPage: page,
  }) => {
    await addFeedForSync(page);
    await goToSyncSection(page);
    await page.getByRole("button", { name: "Enable sync" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Your secret key")).toBeVisible({
      timeout: 5000,
    });
    const passphraseEl = dialog.locator(".font-mono");
    await expect(passphraseEl).toBeVisible();
    const passphrase = await passphraseEl.textContent();
    expect(passphrase?.trim().split(/\s+/).length).toBe(4);
  });

  test("enable sync: save checkbox → continue → confirm → done", async ({
    feedPage: page,
  }) => {
    await addFeedForSync(page);
    await goToSyncSection(page);
    await page.getByRole("button", { name: "Enable sync" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Your secret key")).toBeVisible();

    const passphraseEl = dialog.locator(".font-mono");
    await expect(passphraseEl).toBeVisible();
    const passphrase = await passphraseEl.textContent();

    const continueBtn = dialog.getByRole("button", { name: "Continue" });
    await expect(continueBtn).toBeDisabled();

    await dialog.getByText("I've saved my secret key").click();
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    await expect(dialog.getByText("Confirm your secret key")).toBeVisible();
    await dialog
      .getByPlaceholder("Enter your secret key")
      .fill(passphrase?.trim() ?? "");
    await dialog.getByRole("button", { name: "Enable sync" }).click();

    await expect(dialog.getByText("Sync is set up")).toBeVisible({
      timeout: 10000,
    });

    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden({ timeout: 5000 });
  });

  test("delete all data: confirm → resets to All items article list", async ({
    feedPage: page,
  }) => {
    await addFeedForSync(page);
    await goToSyncSection(page);

    await page.getByRole("button", { name: "Delete all data" }).click();

    const confirm = page.getByRole("dialog");
    await expect(confirm.getByText("Delete all data?")).toBeVisible({
      timeout: 5000,
    });
    await confirm.getByRole("button", { name: "Delete everything" }).click();

    // After reset: auto-init lands the user on /feeds/all (the new
    // post-reset default).
    await page.waitForURL(/\/feeds\/all/, { timeout: 15000 });
  });

  test("Switch to local only offers BOTH keep-vault and delete-vault CTAs (PR C fork)", async ({
    feedPage: page,
  }) => {
    await addFeedForSync(page);
    await goToSyncSection(page);

    // Need to be in synced state to see "Switch to local only" — fastest
    // is to first enable sync via the setup wizard. We skip the full
    // wizard ceremony here and just enable via the UI shortcut.
    await page.getByRole("button", { name: "Enable sync" }).click();
    const setupDialog = page.getByRole("dialog");
    await expect(setupDialog.getByText("Your secret key")).toBeVisible();
    const passphraseEl = setupDialog.locator(".font-mono");
    const passphrase = await passphraseEl.textContent();

    await setupDialog.getByText("I've saved my secret key").click();
    await setupDialog.getByRole("button", { name: "Continue" }).click();
    await setupDialog
      .getByPlaceholder("Enter your secret key")
      .fill(passphrase?.trim() ?? "");
    await setupDialog.getByRole("button", { name: "Enable sync" }).click();
    await expect(setupDialog.getByText("Sync is set up")).toBeVisible({
      timeout: 10000,
    });
    await setupDialog.getByRole("button", { name: "Done" }).click();
    await expect(setupDialog).toBeHidden({ timeout: 5000 });

    // Now we're synced. Click "Switch to local only" → the fork dialog
    // should show both CTAs.
    await page.getByRole("button", { name: /switch to local/i }).click();
    const forkDialog = page.getByRole("dialog");
    await expect(forkDialog.getByText("Switch to local only?")).toBeVisible({
      timeout: 5000,
    });
    await expect(
      forkDialog.getByRole("button", { name: /^keep cloud vault$/i }),
    ).toBeVisible();
    await expect(
      forkDialog.getByRole("button", { name: /delete cloud vault forever/i }),
    ).toBeVisible();
  });
});
