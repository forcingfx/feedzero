import { test, expect } from "./fixtures";

test.describe("Sync", () => {
  test("sync chip shows Local only after local-only onboarding", async ({
    feedPage: page,
  }) => {
    // feedPage fixture sets storage-mode to "local"
    // The sync status chip should show "Local only"
    await expect(page.getByText("Local only")).toBeVisible({ timeout: 10000 });
  });

  test("clicking chip opens data & storage dialog", async ({
    feedPage: page,
  }) => {
    await page.getByText("Local only").click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText("Data & storage")).toBeVisible();
    await expect(
      dialog.getByText("Your data is stored locally in this browser only."),
    ).toBeVisible();
  });

  test("enable sync shows passphrase in setup dialog", async ({
    feedPage: page,
  }) => {
    await page.getByText("Local only").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });

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

  test("enable sync: save checkbox → enable → done", async ({
    feedPage: page,
  }) => {
    await page.getByText("Local only").click();
    const dialog = page.getByRole("dialog");

    await dialog.getByRole("button", { name: "Enable sync" }).click();

    // Enable button should be disabled until checkbox is checked
    const enableBtn = dialog.getByRole("button", { name: "Enable sync" });
    await expect(enableBtn).toBeDisabled();

    // Check the save checkbox
    await dialog.getByText("I've saved my secret key").click();
    await expect(enableBtn).toBeEnabled();

    // Click enable
    await enableBtn.click();

    // Should show "Setting up sync" loading then "Sync is set up" done
    await expect(
      dialog.getByText("Sync is set up"),
    ).toBeVisible({ timeout: 10000 });

    // Click Done to close
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden({ timeout: 5000 });
  });

  test("delete all data returns to onboarding", async ({
    feedPage: page,
  }) => {
    await page.getByText("Local only").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click "Delete all data" in danger zone
    await dialog
      .getByRole("button", { name: "Delete all data" })
      .click();

    // Confirmation dialog should appear
    await expect(dialog.getByText("Delete all data?")).toBeVisible({
      timeout: 5000,
    });

    // Confirm deletion
    await dialog
      .getByRole("button", { name: "Delete everything" })
      .click();

    // Should return to onboarding
    await expect(
      page.getByText("Welcome to FeedZero"),
    ).toBeVisible({ timeout: 10000 });
  });
});
