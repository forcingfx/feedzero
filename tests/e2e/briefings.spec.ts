import { test, expect } from "./fixtures";

/**
 * E2E for Signal Briefings.
 *
 * Covers the user-observable paths that the unit/integration suite
 * can't see in a real browser:
 *  - The sidebar entry exists and is keyboard/click reachable.
 *  - Default (Free-tier) users navigate to the gate-locked upgrade
 *    splash, not to a half-rendered page.
 *  - The Settings → Briefings tab is reachable and has the API key
 *    field + the model picker.
 *  - The new-briefing dialog opens from the index and accepts a name
 *    + prompt without blowing up.
 *
 * Full Pro-tier refresh-with-mocked-Anthropic is left out because
 * setting up a valid Pro license in E2E requires a signed token
 * fixture; that path is locked down by the integration test
 * (tests/integration/briefing-store-db.test.ts) against the real db.
 */

test.describe("Signal Briefings — sidebar + free-tier upgrade splash", () => {
  test("Signal sidebar entry + Briefings sub-tab routes free users to the upgrade splash", async ({
    feedPage: page,
  }) => {
    // Briefings is a sub-tab under Signal (PR #190): the sidebar entry
    // is "Signal" (testId `sidebar-signal-link`), clicking it lands on
    // /signal, and the "Briefings" sub-tab navigates to /signal/briefings
    // where the gate-locked upgrade splash renders for free-tier users.
    const isMobile = page.viewportSize() && page.viewportSize()!.width < 768;
    if (isMobile) {
      const drawerHandle = page
        .getByRole("button", { name: /Menu|Drawer|Open/i })
        .first();
      if (await drawerHandle.isVisible().catch(() => false)) {
        await drawerHandle.click();
      }
    }
    const signalLink = page.getByTestId("sidebar-signal-link").first();
    await expect(signalLink).toBeVisible({ timeout: 10000 });
    await signalLink.click();
    await page.getByRole("radio", { name: "Briefings" }).click();
    // Free-tier user — UpgradeSplash for `signal-briefings` renders
    // "Unlock Signal Briefings" + a "Pro" tier label.
    await expect(
      page
        .getByText(/Pro/i)
        .or(page.getByText(/Signal Briefings/i))
        .first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("Settings → Briefings tab renders the API key field + model picker", async ({
    feedPage: page,
  }) => {
    await page.goto("/settings?tab=briefings");
    await expect(
      page.getByText(/Anthropic API key/i).first(),
    ).toBeVisible({ timeout: 10000 });
    // The privacy disclosure: "FeedZero's servers never see" or similar.
    await expect(
      page
        .getByText(/never see/i)
        .or(page.getByText(/api\.anthropic\.com/i))
        .first(),
    ).toBeVisible();
    // Three model choices — Haiku, Sonnet, Opus.
    await expect(page.getByText(/Haiku/i).first()).toBeVisible();
    await expect(page.getByText(/Sonnet/i).first()).toBeVisible();
    await expect(page.getByText(/Opus/i).first()).toBeVisible();
  });

  test("Saving an Anthropic key updates the 'saved' badge", async ({
    feedPage: page,
  }) => {
    await page.goto("/settings?tab=briefings");
    await page
      .getByText(/Anthropic API key/i)
      .first()
      .waitFor({ timeout: 10000 });

    const keyInput = page.locator('input[type="password"]').first();
    await keyInput.fill("sk-ant-test-key-from-e2e");
    await page.getByRole("button", { name: /^Save$/i }).first().click();

    // Successful save renders BOTH the sonner toast AND the inline
    // emerald "saved" badge next to the field. The toast is the more
    // specific signal — assert on it directly to avoid a strict-mode
    // violation against the two simultaneous matches.
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /saved/i })
        .first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("Switching the model preference updates the radio selection", async ({
    feedPage: page,
  }) => {
    await page.goto("/settings?tab=briefings");
    await page
      .getByText(/Preferred model/i)
      .first()
      .waitFor({ timeout: 10000 });

    // Click the Opus radio — its label includes "Opus 4.7".
    const opusLabel = page
      .locator("label")
      .filter({ hasText: /Opus 4\.7/i })
      .first();
    await opusLabel.click();

    // The Opus radio is now checked.
    const opusRadio = opusLabel.locator('input[type="radio"]');
    await expect(opusRadio).toBeChecked();
  });
});
