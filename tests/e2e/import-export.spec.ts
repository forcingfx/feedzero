import { test, expect, addFeedViaUI } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";
import type { Page } from "@playwright/test";

/** Sample OPML with 2 feeds */
const SAMPLE_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test Subscriptions</title>
  </head>
  <body>
    <outline type="rss" text="Test Feed" title="Test Feed" xmlUrl="https://example.com/feed" htmlUrl="https://example.com/"/>
    <outline type="rss" text="Another Feed" title="Another Feed" xmlUrl="https://another.com/rss" htmlUrl="https://another.com/"/>
  </body>
</opml>`;

/** Sample URL list */
const SAMPLE_URL_LIST = `https://example.com/feed
https://another.com/rss`;

/**
 * Navigate to the Settings → Data tab from Explore. The Import/Export
 * affordance on Explore is a navigation button (not a dialog opener)
 * after PR A-B.
 */
async function goToImportExportTab(page: Page) {
  await page.goto("/explore");
  await page.waitForFunction(
    () => !document.body.textContent?.includes("Loading"),
    { timeout: 10000 },
  );
  await page.getByRole("button", { name: "Import / Export" }).click();
  await page.waitForURL(/\/settings\?tab=sync-and-data/, { timeout: 5000 });
  await expect(
    page.getByRole("heading", { name: /^Settings$/i }),
  ).toBeVisible();
  // Wait for Import + Export cards to render
  await expect(page.getByRole("heading", { name: /^Import$/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Export$/i })).toBeVisible();
}

/**
 * Confirm the import-preview step that PR #192 inserted between the
 * initial "Import feeds" click and the addFeed loop. The preview's
 * confirm button is "Import N feed(s)" — wait for it, click it.
 */
async function confirmImportPreview(page: Page) {
  const confirm = page
    .getByTestId("import-preview")
    .getByRole("button", { name: /^Import \d+ feeds?$/ });
  await expect(confirm).toBeVisible({ timeout: 5000 });
  await confirm.click();
}

test.describe("Import/Export navigation", () => {
  test("Explore 'Import / Export' button navigates to Settings → Data", async ({
    feedPage: page,
  }) => {
    await goToImportExportTab(page);
    // No dialog — Settings is a page now.
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("Import and Export are visible simultaneously (no longer separate tabs)", async ({
    feedPage: page,
  }) => {
    await goToImportExportTab(page);
    await expect(
      page.getByRole("button", { name: "Import feeds" }),
    ).toBeVisible();
    await expect(page.getByText("No feeds to export")).toBeVisible();
  });
});

test.describe("Import feeds", () => {
  test("imports feeds from pasted OPML", async ({ feedPage: page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await goToImportExportTab(page);

    // Switch the Import card to text-paste mode.
    await page.getByRole("radio", { name: "Paste text" }).click();
    await page
      .getByPlaceholder(/^Paste OPML XML/)
      .fill(SAMPLE_OPML);
    await page.getByRole("button", { name: "Import feeds" }).click();
    await confirmImportPreview(page);

    await expect(page.getByText(/Adding feed/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/\d+ feeds? added/i)).toBeVisible({
      timeout: 15000,
    });

    // "Done" returns to the input view.
    await page.getByRole("button", { name: "Done" }).click();
  });

  test("imports feeds from pasted URL list", async ({ feedPage: page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await goToImportExportTab(page);

    await page.getByRole("radio", { name: "Paste text" }).click();
    await page
      .getByPlaceholder(/^Paste OPML XML/)
      .fill(SAMPLE_URL_LIST);
    await page.getByRole("button", { name: "Import feeds" }).click();
    await confirmImportPreview(page);

    await expect(page.getByText(/\d+ feeds? added/i)).toBeVisible({
      timeout: 15000,
    });
  });

  test("Import button is disabled with empty text input", async ({
    feedPage: page,
  }) => {
    await goToImportExportTab(page);
    await page.getByRole("radio", { name: "Paste text" }).click();
    const importBtn = page.getByRole("button", { name: "Import feeds" });
    await expect(importBtn).toBeDisabled();
  });

  test("shows error for content with no valid URLs", async ({
    feedPage: page,
  }) => {
    await goToImportExportTab(page);
    await page.getByRole("radio", { name: "Paste text" }).click();
    await page
      .getByPlaceholder(/^Paste OPML XML/)
      .fill("# just a comment\n\n# another comment");
    await page.getByRole("button", { name: "Import feeds" }).click();

    await expect(page.getByText(/No valid.*URL/i)).toBeVisible();
  });

  test("can import more after completion", async ({ feedPage: page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await goToImportExportTab(page);

    await page.getByRole("radio", { name: "Paste text" }).click();
    await page
      .getByPlaceholder(/^Paste OPML XML/)
      .fill("https://example.com/feed");
    await page.getByRole("button", { name: "Import feeds" }).click();
    await confirmImportPreview(page);

    await expect(page.getByText(/\d+ feeds? added/i)).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: "Import more" }).click();
    await expect(
      page.getByRole("radio", { name: "Upload file" }),
    ).toBeVisible();
  });
});

test.describe("Export feeds", () => {
  test("shows 'No feeds to export' when the user has no feeds", async ({
    feedPage: page,
  }) => {
    await goToImportExportTab(page);
    await expect(page.getByText("No feeds to export")).toBeVisible();
  });

  test("shows URL list and download button when feeds exist", async ({
    feedPage: page,
  }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);

    await addFeedViaUI(page, "https://example.com/feed");
    await page.waitForURL(/\/feeds\//, { timeout: 10000 });

    await goToImportExportTab(page);

    await expect(page.getByText(/1 feed.*to export/i)).toBeVisible();
    await expect(page.getByText("https://example.com/feed")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download OPML" }),
    ).toBeVisible();
  });

  test("copies URL list to clipboard", async ({ feedPage: page, context }) => {
    await context.grantPermissions(["clipboard-write", "clipboard-read"]);
    await mockFeedEndpoint(page, SAMPLE_RSS);

    await addFeedViaUI(page, "https://example.com/feed");
    await page.waitForURL(/\/feeds\//, { timeout: 10000 });

    await goToImportExportTab(page);
    await page.getByRole("button", { name: "Copy to clipboard" }).click();

    await expect(page.locator("[data-sonner-toast]")).toBeVisible({
      timeout: 5000,
    });
  });
});
