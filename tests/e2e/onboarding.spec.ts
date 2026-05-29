/**
 * Onboarding E2E — the user's first impression of FeedZero.
 *
 * IMPORTANT historical note: this file previously asserted the
 * OPPOSITE of what it asserts now. The prior contract was
 * "no onboarding modal appears for new users; auto-initializes
 * silently." That contract crystallized the bug fixed in `a27397d`:
 * every new user was being routed into a local-only DB with an
 * unrecoverable passphrase, and the existence of these tests
 * actively prevented the bug from being noticed during code review.
 *
 * Per CLAUDE.md's 4-incident pattern ("tests that verify the bug as
 * a feature"), this rewrite restores the user-facing contract:
 *  - a fresh browser shows the welcome screen
 *  - the user has to make an explicit storage choice
 *  - only after they finish does the onboarding flag flip
 *
 * The `feedPage` fixture (which sets ONBOARDING_COMPLETE in init
 * script to skip onboarding) is INTENTIONALLY not used here — it's
 * the right shortcut for every OTHER test, but for this one the
 * skip is the bug.
 */
import { test, expect } from "@playwright/test";
import { blockReleaseAutoSubscribe } from "./fixtures";

async function freshBrowser(page: import("@playwright/test").Page) {
  // Clear localStorage so the app boots into the never-onboarded path.
  // Suppress the changelog dialog so its presence doesn't interfere
  // with our assertions about the onboarding dialog.
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem("feedzero:last-seen-version", "999.0.0");
    } catch {
      /* lockdown / sandbox — accept and move on */
    }
  });
  await blockReleaseAutoSubscribe(page);
}

test.describe("onboarding", () => {
  test("a first-launch user sees the welcome step", async ({ page }) => {
    await freshBrowser(page);
    await page.goto("/feeds");

    // The user-observable contract: the welcome dialog is visible.
    await expect(
      page.getByRole("heading", { name: /welcome to feedzero/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Regression-lock for silent-auto-init: the flag is NOT set yet.
    // If startNewUserOnboarding ever re-acquires the responsibility
    // of calling completeOnboarding before the user has interacted,
    // this trips.
    const flag = await page.evaluate(() =>
      localStorage.getItem("feedzero:onboarding-complete"),
    );
    expect(flag).toBeNull();
  });

  test("picking 'Local only' completes onboarding and the modal closes", async ({
    page,
  }) => {
    await freshBrowser(page);
    await page.goto("/feeds");

    // Welcome → storage-choice
    await expect(
      page.getByRole("heading", { name: /welcome to feedzero/i }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /get started/i }).click();

    // Storage-choice → local only
    await expect(
      page.getByRole("heading", { name: /where should we store/i }),
    ).toBeVisible();
    await page
      .getByRole("radio", { name: /local only/i })
      .click({ force: true });
    await page.getByRole("button", { name: /^continue$/i }).click();

    // Local-only mode skips passphrase-display and goes straight to
    // initializing. The modal closes once completeOnboarding flips
    // hasCompletedOnboarding.
    await expect(
      page.getByRole("heading", { name: /welcome to feedzero/i }),
    ).not.toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("heading", { name: /where should we store/i }),
    ).not.toBeVisible();

    // Flag flipped now (legitimate completion).
    const flag = await page.evaluate(() =>
      localStorage.getItem("feedzero:onboarding-complete"),
    );
    expect(flag).toBe("true");
  });

  test("a returning user does not see the welcome step", async ({ page }) => {
    // Negative control: the modal must not leak into normal use.
    await page.addInitScript(() => {
      localStorage.setItem("feedzero:onboarding-complete", "true");
      localStorage.setItem("feedzero:storage-mode", "local");
      localStorage.setItem("feedzero:last-seen-version", "999.0.0");
    });
    await blockReleaseAutoSubscribe(page);

    await page.goto("/feeds");

    await expect(
      page.getByRole("heading", { name: /welcome to feedzero/i }),
    ).not.toBeVisible({ timeout: 5_000 });
  });
});
