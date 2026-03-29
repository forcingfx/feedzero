import { test, expect, addFeedViaUI } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";
import type { Page } from "@playwright/test";

/**
 * Helper to open the sync dialog via the Settings dropdown in the sidebar.
 * On mobile, opens the sidebar first if needed.
 */
async function openSyncDialog(page: Page) {
  // On mobile, the sidebar may need to be opened first
  const settingsBtn = page.locator('[data-sidebar="menu-button"]', {
    hasText: "Settings",
  });
  if (!(await settingsBtn.isVisible())) {
    const sidebarTrigger = page
      .getByRole("main")
      .getByRole("button", { name: /toggle sidebar/i });
    await sidebarTrigger.click();
    await settingsBtn.waitFor({ state: "visible", timeout: 5000 });
  }

  // Click the Settings button to open dropdown
  await settingsBtn.click();

  // Click "Cloud sync" in the dropdown menu
  await page.getByRole("menuitem", { name: "Cloud sync" }).click();

  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
}

/**
 * Helper to add a feed so the "Cloud sync" menu item is enabled.
 * Sync requires at least one feed. Works on both desktop and mobile.
 */
async function addFeedForSync(page: Page) {
  await mockFeedEndpoint(page, SAMPLE_RSS);
  await addFeedViaUI(page, "https://example.com/feed");
  // Wait for the app to navigate to the feed page (works on both viewports)
  await page.waitForURL(/\/feeds\//, { timeout: 10000 });
  // Also wait for the success toast to confirm the feed was added
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 10000 });
}

test.describe("Sync", () => {
  test.describe("existing cloud account flow", () => {
    test("shows 'Use existing cloud account' button for local-only users", async ({
      feedPage: page,
    }) => {
      await addFeedForSync(page);
      await openSyncDialog(page);
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await expect(
        dialog.getByRole("button", { name: "Use existing cloud account" }),
      ).toBeVisible();
    });

    test("clicking 'Use existing cloud account' shows passphrase entry", async ({
      feedPage: page,
    }) => {
      await addFeedForSync(page);
      await openSyncDialog(page);
      const dialog = page.getByRole("dialog");

      await dialog
        .getByRole("button", { name: "Use existing cloud account" })
        .click();

      await expect(
        dialog.getByText("Use existing cloud account"),
      ).toBeVisible();
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
      await openSyncDialog(page);
      const dialog = page.getByRole("dialog");

      await dialog
        .getByRole("button", { name: "Use existing cloud account" })
        .click();

      const connectBtn = dialog.getByRole("button", { name: "Connect" });
      await expect(connectBtn).toBeDisabled();
    });

    test("connect button is enabled when passphrase is entered", async ({
      feedPage: page,
    }) => {
      await addFeedForSync(page);
      await openSyncDialog(page);
      const dialog = page.getByRole("dialog");

      await dialog
        .getByRole("button", { name: "Use existing cloud account" })
        .click();

      await dialog
        .getByPlaceholder("Enter your passphrase")
        .fill("test-passphrase");

      const connectBtn = dialog.getByRole("button", { name: "Connect" });
      await expect(connectBtn).toBeEnabled();
    });

    test("cancel returns to status view", async ({ feedPage: page }) => {
      await addFeedForSync(page);
      await openSyncDialog(page);
      const dialog = page.getByRole("dialog");

      await dialog
        .getByRole("button", { name: "Use existing cloud account" })
        .click();

      await expect(
        dialog.getByPlaceholder("Enter your passphrase"),
      ).toBeVisible();

      await dialog.getByRole("button", { name: "Cancel" }).click();

      // Back to status view
      await expect(dialog.getByText("Data & storage")).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Enable sync" }),
      ).toBeVisible();
    });

    test("shows error when cloud account not found", async ({
      feedPage: page,
    }) => {
      await addFeedForSync(page);
      await openSyncDialog(page);
      const dialog = page.getByRole("dialog");

      await dialog
        .getByRole("button", { name: "Use existing cloud account" })
        .click();

      // Enter a passphrase that won't exist
      await dialog
        .getByPlaceholder("Enter your passphrase")
        .fill("nonexistent-passphrase-test");

      await dialog.getByRole("button", { name: "Connect" }).click();

      // Should show checking state then error
      await expect(dialog.getByText("Could not connect")).toBeVisible({
        timeout: 10000,
      });

      // Error message and try again button should be visible
      await expect(
        dialog.getByRole("button", { name: "Try again" }),
      ).toBeVisible();
    });

    test("try again returns to passphrase entry", async ({
      feedPage: page,
    }) => {
      await addFeedForSync(page);
      await openSyncDialog(page);
      const dialog = page.getByRole("dialog");

      await dialog
        .getByRole("button", { name: "Use existing cloud account" })
        .click();

      await dialog
        .getByPlaceholder("Enter your passphrase")
        .fill("nonexistent-passphrase-test");

      await dialog.getByRole("button", { name: "Connect" }).click();

      await expect(dialog.getByText("Could not connect")).toBeVisible({
        timeout: 10000,
      });

      await dialog.getByRole("button", { name: "Try again" }).click();

      // Back to passphrase entry
      await expect(
        dialog.getByPlaceholder("Enter your passphrase"),
      ).toBeVisible();
    });
  });

  test("sync badge shows Local in settings footer", async ({
    feedPage: page,
  }) => {
    // feedPage fixture sets storage-mode to "local"
    // The sync status badge should show "Local" in the Settings footer
    // On mobile, need to open sidebar first
    const settingsBtn = page.locator('[data-sidebar="menu-button"]', {
      hasText: "Settings",
    });
    if (!(await settingsBtn.isVisible())) {
      const sidebarTrigger = page
        .getByRole("main")
        .getByRole("button", { name: /toggle sidebar/i });
      await sidebarTrigger.click();
    }
    await expect(settingsBtn).toBeVisible({ timeout: 10000 });
    // The Settings button contains the SyncBadge with "Local" text
    await expect(settingsBtn.getByText("Local")).toBeVisible();
  });

  test("clicking Cloud sync opens data & storage dialog", async ({
    feedPage: page,
  }) => {
    await addFeedForSync(page);
    await openSyncDialog(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Data & storage")).toBeVisible();
    await expect(
      dialog.getByText("Your data is stored locally in this browser only."),
    ).toBeVisible();
  });

  test("enable sync shows passphrase in setup dialog", async ({
    feedPage: page,
  }) => {
    await addFeedForSync(page);
    await openSyncDialog(page);
    const dialog = page.getByRole("dialog");

    // Click "Enable sync"
    await dialog.getByRole("button", { name: "Enable sync" }).click();

    // Should show passphrase in setup wizard
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
    await openSyncDialog(page);
    const dialog = page.getByRole("dialog");

    await dialog.getByRole("button", { name: "Enable sync" }).click();

    // Wait for passphrase display
    await expect(dialog.getByText("Your secret key")).toBeVisible();

    // Get the passphrase before navigating away
    const passphraseEl = dialog.locator(".font-mono");
    await expect(passphraseEl).toBeVisible();
    const passphrase = await passphraseEl.textContent();

    // Continue button should be disabled until checkbox is checked
    const continueBtn = dialog.getByRole("button", { name: "Continue" });
    await expect(continueBtn).toBeDisabled();

    // Check the save checkbox
    await dialog.getByText("I've saved my secret key").click();
    await expect(continueBtn).toBeEnabled();

    // Click Continue to go to confirmation step
    await continueBtn.click();

    // Should show confirmation input
    await expect(dialog.getByText("Confirm your secret key")).toBeVisible();

    // Enter the passphrase in confirmation input
    await dialog
      .getByPlaceholder("Enter your secret key")
      .fill(passphrase?.trim() ?? "");

    // Click Enable sync
    await dialog.getByRole("button", { name: "Enable sync" }).click();

    // Should show "Sync is set up" done
    await expect(dialog.getByText("Sync is set up")).toBeVisible({
      timeout: 10000,
    });

    // Click Done to close
    await dialog.getByRole("button", { name: "Done" }).click();
    // Check that Data & storage heading is gone (sidebar sheet is also a dialog on mobile)
    await expect(dialog.getByText("Data & storage")).toBeHidden({
      timeout: 5000,
    });
  });

  test("delete all data resets to explore page", async ({ feedPage: page }) => {
    await addFeedForSync(page);
    await openSyncDialog(page);
    const dialog = page.getByRole("dialog");

    // Click "Delete all data" in danger zone
    await dialog.getByRole("button", { name: "Delete all data" }).click();

    // Confirmation dialog should appear
    await expect(dialog.getByText("Delete all data?")).toBeVisible({
      timeout: 5000,
    });

    // Confirm deletion
    await dialog.getByRole("button", { name: "Delete everything" }).click();

    // Should reset the app — after auto-init, user lands on Explore page
    await expect(page.getByText("Explore")).toBeVisible({
      timeout: 15000,
    });
  });
});
