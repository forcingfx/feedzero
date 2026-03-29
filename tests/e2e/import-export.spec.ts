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

/** Helper to open the import/export dialog from the Explore page */
async function openImportExportDialog(page: Page) {
  await page.goto("/explore");
  await page.waitForFunction(
    () => !document.body.textContent?.includes("Loading"),
    { timeout: 10000 },
  );
  await page.getByRole("button", { name: "Import / Export" }).click();
}

test.describe("Import/Export dialog", () => {
  test("opens import/export dialog from explore page", async ({
    feedPage: page,
  }) => {
    await openImportExportDialog(page);

    // Dialog should open
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("toggles between import and export views", async ({
    feedPage: page,
  }) => {
    await openImportExportDialog(page);

    // Should start on Import view — the Import feeds button should be visible
    await expect(page.getByRole("button", { name: "Import feeds" })).toBeVisible();

    // Switch to Export
    await page.getByRole("radio", { name: "Export feeds" }).click();
    await expect(page.getByText("No feeds to export")).toBeVisible();

    // Switch back to Import
    await page.getByRole("radio", { name: "Import feeds" }).click();
    await expect(page.getByRole("button", { name: "Import feeds" })).toBeVisible();
  });

  test("closes dialog on escape", async ({ feedPage: page }) => {
    await openImportExportDialog(page);
    const settingsHeading = page.getByRole("heading", { name: "Settings" });
    await expect(settingsHeading).toBeVisible();

    // Press escape
    await page.keyboard.press("Escape");
    await expect(settingsHeading).toBeHidden();
  });
});

test.describe("Import feeds", () => {
  test("imports feeds from pasted OPML", async ({ feedPage: page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);

    await openImportExportDialog(page);

    // Switch to text input mode
    await page.getByRole("radio", { name: "Paste text" }).click();

    // Paste OPML content
    await page
      .getByPlaceholder("Paste OPML XML or feed URLs (one per line)")
      .fill(SAMPLE_OPML);

    // Click import
    await page.getByRole("button", { name: "Import feeds" }).click();

    // Should show progress then results
    await expect(page.getByText(/Adding feed/)).toBeVisible({ timeout: 5000 });

    // Wait for completion
    await expect(page.getByText(/feed.*added/i)).toBeVisible({
      timeout: 15000,
    });

    // Close the dialog
    await page.getByRole("button", { name: "Done" }).click();
  });

  test("imports feeds from pasted URL list", async ({ feedPage: page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);

    await openImportExportDialog(page);
    await page.getByRole("radio", { name: "Paste text" }).click();
    await page
      .getByPlaceholder("Paste OPML XML or feed URLs (one per line)")
      .fill(SAMPLE_URL_LIST);
    await page.getByRole("button", { name: "Import feeds" }).click();

    // Wait for results
    await expect(page.getByText(/feed.*added/i)).toBeVisible({
      timeout: 15000,
    });
  });

  test("shows error for empty text input", async ({ feedPage: page }) => {
    await openImportExportDialog(page);
    await page.getByRole("radio", { name: "Paste text" }).click();

    // Try to import with empty input — button should be disabled
    const importBtn = page.getByRole("button", { name: "Import feeds" });
    await expect(importBtn).toBeDisabled();
  });

  test("shows error for invalid content", async ({ feedPage: page }) => {
    await openImportExportDialog(page);
    await page.getByRole("radio", { name: "Paste text" }).click();
    // Use content with only comment lines and blank lines — no valid URLs
    await page
      .getByPlaceholder("Paste OPML XML or feed URLs (one per line)")
      .fill("# just a comment\n\n# another comment");
    await page.getByRole("button", { name: "Import feeds" }).click();

    // Should show error about no valid URLs
    await expect(page.getByText(/No valid.*URL/i)).toBeVisible();
  });

  test("can import more after completion", async ({ feedPage: page }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);

    await openImportExportDialog(page);
    await page.getByRole("radio", { name: "Paste text" }).click();
    await page
      .getByPlaceholder("Paste OPML XML or feed URLs (one per line)")
      .fill("https://example.com/feed");
    await page.getByRole("button", { name: "Import feeds" }).click();

    await expect(page.getByText(/feed.*added/i)).toBeVisible({
      timeout: 15000,
    });

    // Click "Import more" to reset
    await page.getByRole("button", { name: "Import more" }).click();

    // Should be back to input view
    await expect(
      page.getByRole("radio", { name: "Upload file" }),
    ).toBeVisible();
  });
});

test.describe("Export feeds", () => {
  test("shows message when no feeds to export", async ({ feedPage: page }) => {
    await openImportExportDialog(page);
    await page.getByRole("radio", { name: "Export feeds" }).click();

    await expect(page.getByText("No feeds to export")).toBeVisible();
  });

  test("shows URL list and download button when feeds exist", async ({
    feedPage: page,
  }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);

    // Add a feed first and wait for navigation
    await addFeedViaUI(page, "https://example.com/feed");
    await page.waitForURL(/\/feeds\//, { timeout: 10000 });

    // Open import/export dialog and go to export
    await openImportExportDialog(page);
    await page.getByRole("radio", { name: "Export feeds" }).click();

    // Should show feed count and URL list
    await expect(page.getByText(/1 feed.*to export/i)).toBeVisible();
    await expect(page.getByText("https://example.com/feed")).toBeVisible();

    // Download button should be visible
    await expect(
      page.getByRole("button", { name: "Download OPML" }),
    ).toBeVisible();
  });

  test("copies URL list to clipboard", async ({ feedPage: page, context }) => {
    // Grant clipboard permissions for this test
    await context.grantPermissions(["clipboard-write", "clipboard-read"]);

    await mockFeedEndpoint(page, SAMPLE_RSS);

    // Add a feed first and wait for navigation
    await addFeedViaUI(page, "https://example.com/feed");
    await page.waitForURL(/\/feeds\//, { timeout: 10000 });

    // Open import/export dialog and go to export
    await openImportExportDialog(page);
    await page.getByRole("radio", { name: "Export feeds" }).click();

    // Click copy button
    await page.getByRole("button", { name: "Copy to clipboard" }).click();

    // Should show toast
    await expect(page.locator("[data-sonner-toast]")).toBeVisible({
      timeout: 5000,
    });
  });
});
