/**
 * The article list (second column) keeps the width the user dragged it to
 * across a reload. A user reported by email on 2026-11-08 that it "always
 * defaults back to a very wide one" — the panel had no persistence and
 * fell back to 40% of the stage on every load.
 *
 * Desktop-only: mobile shows one column at a time, with no resize handle.
 */
import { test, expect, addFeedViaUI, selectFeedInSidebar } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";

async function articleListWidth(page: import("@playwright/test").Page) {
  const panel = page.locator('[data-panel][id="article-list"]');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  if (!box) throw new Error("article-list panel had no bounding box");
  return Math.round(box.width);
}

test.describe("Article list width", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 1024, "Desktop only");

  test("survives a reload at the width the user dragged it to", async ({
    feedPage: page,
  }) => {
    await mockFeedEndpoint(page, SAMPLE_RSS);
    await addFeedViaUI(page, "https://example.com/feed");
    await selectFeedInSidebar(page, "Test Feed");

    const startingWidth = await articleListWidth(page);
    // The outer group's handle (sidebar | stage) comes first; the inner
    // stage group's handle (article list | reader) is the last one.
    const handle = page.locator('[data-slot="resizable-handle"]').last();
    const box = await handle.boundingBox();
    if (!box) throw new Error("article-list handle had no bounding box");
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x - 150, y, { steps: 8 });
    await page.mouse.up();

    const narrowed = await articleListWidth(page);
    expect(narrowed, "drag should narrow the article list").toBeLessThan(startingWidth - 50);

    await page.reload();
    await selectFeedInSidebar(page, "Test Feed");

    await expect.poll(() => articleListWidth(page)).toBe(narrowed);
  });
});
