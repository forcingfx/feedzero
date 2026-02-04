import { test, expect } from "@playwright/test";

test.describe("Onboarding", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage so onboarding is not skipped
    await page.addInitScript(() => {
      localStorage.clear();
    });
  });

  test("new user sees welcome modal", async ({ page }) => {
    await page.goto("/feeds");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Welcome to FeedZero")).toBeVisible();
    await expect(dialog.getByText("Your feeds, your privacy.")).toBeVisible();
  });

  test("welcome → storage choice", async ({ page }) => {
    await page.goto("/feeds");
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Get Started" }).click();
    await expect(
      dialog.getByText("Where should we store your data?"),
    ).toBeVisible();
  });

  test("local-only path completes onboarding", async ({ page }) => {
    await page.goto("/feeds");
    const dialog = page.getByRole("dialog");

    // Welcome → Get Started
    await dialog.getByRole("button", { name: "Get Started" }).click();

    // Storage Choice → select Local only → Continue
    await page.getByText("Local only").click();
    await dialog.getByRole("button", { name: "Continue" }).click();

    // Should complete onboarding — dialog closes, app loads
    await expect(dialog).toBeHidden({ timeout: 10000 });
  });

  test("sync path shows passphrase display", async ({ page }) => {
    await page.goto("/feeds");
    const dialog = page.getByRole("dialog");

    await dialog.getByRole("button", { name: "Get Started" }).click();
    await page.getByText("Sync across devices").click();
    await dialog.getByRole("button", { name: "Continue" }).click();

    // Should show passphrase display step
    await expect(dialog.getByText("Your Secret Key")).toBeVisible();
    // Passphrase should be displayed in a monospaced area
    const passphraseEl = dialog.locator(".font-mono");
    await expect(passphraseEl).toBeVisible();
    const passphrase = await passphraseEl.textContent();
    // Passphrase should be 4 words separated by spaces
    expect(passphrase?.trim().split(/\s+/).length).toBe(4);
  });

  test("sync path: save checkbox → confirm passphrase", async ({ page }) => {
    await page.goto("/feeds");
    const dialog = page.getByRole("dialog");

    // Navigate to passphrase display
    await dialog.getByRole("button", { name: "Get Started" }).click();
    await page.getByText("Sync across devices").click();
    await dialog.getByRole("button", { name: "Continue" }).click();

    // Continue button should be disabled until checkbox is checked
    const continueBtn = dialog.getByRole("button", { name: "Continue" });
    await expect(continueBtn).toBeDisabled();

    // Check the save checkbox
    await page.getByLabel("I've saved my secret key").click();
    await expect(continueBtn).toBeEnabled();

    // Click continue → confirmation step
    await continueBtn.click();
    await expect(dialog.getByText("Confirm Your Secret Key")).toBeVisible();
  });

  test("sync path: confirm passphrase → completes", async ({ page }) => {
    await page.goto("/feeds");
    const dialog = page.getByRole("dialog");

    // Navigate to passphrase display
    await dialog.getByRole("button", { name: "Get Started" }).click();
    await page.getByText("Sync across devices").click();
    await dialog.getByRole("button", { name: "Continue" }).click();

    // Grab the passphrase
    const passphrase = await dialog.locator(".font-mono").textContent();

    // Check save and continue
    await page.getByLabel("I've saved my secret key").click();
    await dialog.getByRole("button", { name: "Continue" }).click();

    // Enter passphrase in confirmation field
    await dialog
      .getByPlaceholder("Enter your secret key")
      .fill(passphrase!.trim());
    await dialog.getByRole("button", { name: "Confirm" }).click();

    // Should complete onboarding
    await expect(dialog).toBeHidden({ timeout: 10000 });
  });

  test("recovery path", async ({ page }) => {
    await page.goto("/feeds");
    const dialog = page.getByRole("dialog");

    await dialog.getByRole("button", { name: "Get Started" }).click();
    await page.getByText("I already have a passphrase").click();
    await dialog.getByRole("button", { name: "Continue" }).click();

    // Should show recovery step
    await expect(dialog.getByText("Enter your recovery key")).toBeVisible();
    await expect(
      dialog.getByPlaceholder("Enter your 4-word passphrase"),
    ).toBeVisible();

    // Recover button should be disabled with empty input
    const recoverBtn = dialog.getByRole("button", { name: "Recover" });
    await expect(recoverBtn).toBeDisabled();

    // Enter a passphrase and click recover
    await dialog
      .getByPlaceholder("Enter your 4-word passphrase")
      .fill("alpha bravo charlie delta");
    await expect(recoverBtn).toBeEnabled();
  });

  test("returning user skips onboarding", async ({ page }) => {
    // Set onboarding as complete before navigating
    await page.addInitScript(() => {
      localStorage.setItem("feedzero:onboarding-complete", "true");
      localStorage.setItem("feedzero:storage-mode", "local");
    });
    await page.goto("/feeds");

    // Dialog should NOT appear
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5000 });
    // App should load — "FeedZero" text in sidebar header
    await expect(page.getByText("FeedZero")).toBeVisible({ timeout: 10000 });
  });

  test("modal is non-dismissible", async ({ page }) => {
    await page.goto("/feeds");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // No close button
    const closeButton = dialog.locator('button[aria-label="Close"]');
    await expect(closeButton).toHaveCount(0);

    // Press Escape — dialog should remain
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
  });
});
