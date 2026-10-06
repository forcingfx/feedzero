import { test, expect } from "@playwright/test";
import { skipOnboarding, addFeedViaUI, selectFeedInSidebar } from "./fixtures";
import { mockFeedEndpoint } from "./feed-fixtures";

/**
 * Article retention, end to end: Settings → Reading → Keep articles.
 * Shortening the period asks first with a count, then deletes the
 * expired articles from the list. Starred articles are covered by the
 * unit and integration suites; this proves the user journey.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY_MS).toUTCString();
const item = (title: string, days: number) =>
  `<item><title>${title}</title><link>https://old.example/${title}</link>` +
  `<guid>https://old.example/${title}</guid><pubDate>${ago(days)}</pubDate></item>`;
const AGED_RSS =
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Aged Feed</title>` +
  `<link>https://old.example</link><description>d</description>` +
  `${item("Recent", 2)}${item("Older", 45)}${item("Oldest", 60)}</channel></rss>`;

async function openReadingSettings(page: import("@playwright/test").Page) {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Reading" }).click();
  return page.getByRole("combobox", { name: /keep articles/i });
}

test("shortening the retention period asks first, then removes expired articles", async ({
  page,
}) => {
  await skipOnboarding(page);
  // Keep everything while the aged feed is added; the 30-day default
  // would skip its old items on ingest.
  await (await openReadingSettings(page)).selectOption("never");
  await mockFeedEndpoint(page, AGED_RSS);
  await addFeedViaUI(page, "https://old.example/feed");

  const select = await openReadingSettings(page);
  await select.selectOption("30");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Remove 2 articles");
  await dialog.getByRole("button", { name: "Remove 2 articles" }).click();
  await expect(select).toHaveValue("30");

  await selectFeedInSidebar(page, "Aged Feed");
  const options = page.locator('[role="option"]');
  await expect(options.filter({ hasText: "Recent" })).toBeVisible();
  await expect(options.filter({ hasText: "Older" })).toHaveCount(0);
  await expect(options.filter({ hasText: "Oldest" })).toHaveCount(0);
});
