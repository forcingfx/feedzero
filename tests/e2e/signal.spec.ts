import { test, expect } from "./fixtures";

test.describe("Signal", () => {
  test("sidebar entry navigates to /signal", async ({ feedPage: page }) => {
    const drawerHandle = page.getByTestId("drawer-handle-strip");
    if (await drawerHandle.isVisible({ timeout: 500 }).catch(() => false)) {
      await drawerHandle.click();
      const drawer = page.getByTestId("drawer-content");
      await drawer.waitFor({ state: "visible", timeout: 5000 });
      const signal = drawer.getByRole("button", { name: "Signal", exact: true });
      await signal.scrollIntoViewIfNeeded({ timeout: 5000 });
      await signal.click({ force: true });
    } else {
      await page
        .locator('[data-sidebar="menu-button"]', { hasText: "Signal" })
        .click({ force: true });
    }
    await expect(page).toHaveURL(/\/signal$/);
  });

  test("renders the no-key empty state with API key form", async ({ feedPage: page }) => {
    await page.goto("/signal");
    await expect(
      page.getByText(/Add an Anthropic API key to enable Signal/i),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder(/sk-ant/)).toBeVisible();
    await expect(page.getByRole("button", { name: /save/i })).toBeVisible();
  });

  test("submitting a key swaps to the manage-key header control", async ({
    feedPage: page,
  }) => {
    // Mock Anthropic so the page transitions through generation.
    await page.route("https://api.anthropic.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: [
            { type: "text", text: '{"topStories":[]}' },
          ],
        }),
      }),
    );

    await page.goto("/signal");
    await page.getByPlaceholder(/sk-ant/).fill("sk-ant-e2e-test");
    await page.getByRole("button", { name: /save/i }).click();

    await expect(
      page.getByRole("button", { name: /manage api key/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText(/Add an Anthropic API key to enable Signal/i),
    ).not.toBeVisible();
  });
});
