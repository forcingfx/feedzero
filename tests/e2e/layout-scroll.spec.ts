import { test, expect, addFeedViaUI, selectFeedInSidebar } from "./fixtures";
import { SAMPLE_RSS, mockFeedEndpoint } from "./feed-fixtures";

/** Scoped selector for an article in the list. */
function articleOption(page: import("@playwright/test").Page, text: string) {
  return page.locator('[role="option"]', { hasText: text });
}

/** Adds a feed and selects it, waiting for articles to load. */
async function setupFeed(page: import("@playwright/test").Page) {
  await mockFeedEndpoint(page, SAMPLE_RSS);
  await addFeedViaUI(page, "https://example.com/feed");
  await selectFeedInSidebar(page, "Test Feed");
  await expect(articleOption(page, "First Article")).toBeVisible({
    timeout: 10000,
  });
}

/**
 * Adds a feed on mobile: adds via Explore, then opens sidebar and clicks feed.
 * On mobile the sidebar is hidden, so we must open it to interact with feeds.
 */
async function setupFeedMobile(page: import("@playwright/test").Page) {
  await mockFeedEndpoint(page, SAMPLE_RSS);
  await addFeedViaUI(page, "https://example.com/feed");

  // After adding via Explore, the app navigates to the feed page.
  // Wait for the URL to change to /feeds/
  await page.waitForURL(/\/feeds\//, { timeout: 10000 });

  // Open the sidebar to click the feed
  await page.getByRole("button", { name: /toggle sidebar/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5000 });

  // Click the feed in the sidebar
  await dialog
    .locator('[data-sidebar="menu-button"]', { hasText: "Test Feed" })
    .click();

  // Sidebar closes automatically on mobile
  await expect(dialog).toBeHidden({ timeout: 5000 });

  // On mobile, tapping a feed lands on the article list (no auto-select).
  await expect(articleOption(page, "First Article")).toBeVisible({
    timeout: 10000,
  });
}

test.describe("Layout and scroll", () => {
  test("header stays pinned at top when content overflows", async ({
    feedPage: page,
  }) => {
    await setupFeed(page);

    // Select the fourth article which has long content for scroll testing
    await articleOption(page, "Fourth Article").click();
    await page.waitForTimeout(500);

    // Inject extra tall content into the reader to force overflow
    await page.evaluate(() => {
      const article = document.querySelector("article");
      if (article) {
        const tall = document.createElement("div");
        tall.style.height = "5000px";
        tall.textContent = "Tall spacer for scroll testing";
        article.appendChild(tall);
      }
    });

    // Scroll the reader panel
    const scrollArea = page.locator('[data-slot="scroll-area"]').last();
    await scrollArea.evaluate((el) => {
      const viewport = el.querySelector("[data-slot='scroll-area-viewport']");
      if (viewport) viewport.scrollTop = 1000;
    });

    // Header should still be at the top of the viewport
    const header = page.locator("header").first();
    const headerBox = await header.boundingBox();
    expect(headerBox).toBeTruthy();
    expect(headerBox!.y).toBeLessThanOrEqual(5); // Pinned at top
  });

  test("no document-level scroll", async ({ feedPage: page }) => {
    await setupFeed(page);

    // Inject tall content
    await page.evaluate(() => {
      const article = document.querySelector("article");
      if (article) {
        const tall = document.createElement("div");
        tall.style.height = "5000px";
        article.appendChild(tall);
      }
    });

    // Check document scroll position
    const docScroll = await page.evaluate(
      () => document.documentElement.scrollTop,
    );
    expect(docScroll).toBe(0);

    // Try to scroll the document
    await page.evaluate(() => window.scrollTo(0, 500));
    const afterScroll = await page.evaluate(
      () => document.documentElement.scrollTop,
    );
    expect(afterScroll).toBe(0);
  });

  test("article list scrolls independently", async ({ feedPage: page }) => {
    await setupFeed(page);

    // Get the left panel's scroll area viewport
    const leftScrollViewport = page
      .locator('[data-slot="scroll-area-viewport"]')
      .first();
    const rightScrollViewport = page
      .locator('[data-slot="scroll-area-viewport"]')
      .last();

    // Get initial scroll positions
    const rightBefore = await rightScrollViewport.evaluate(
      (el) => el.scrollTop,
    );

    // Scroll the left panel
    await leftScrollViewport.evaluate((el) => {
      el.scrollTop = 200;
    });

    // Right panel should not have scrolled
    const rightAfter = await rightScrollViewport.evaluate((el) => el.scrollTop);
    expect(rightAfter).toBe(rightBefore);
  });

  test("reader scrolls independently", async ({ feedPage: page }) => {
    await setupFeed(page);

    // Inject tall content
    await page.evaluate(() => {
      const article = document.querySelector("article");
      if (article) {
        const tall = document.createElement("div");
        tall.style.height = "5000px";
        article.appendChild(tall);
      }
    });

    const leftScrollViewport = page
      .locator('[data-slot="scroll-area-viewport"]')
      .first();
    const rightScrollViewport = page
      .locator('[data-slot="scroll-area-viewport"]')
      .last();

    const leftBefore = await leftScrollViewport.evaluate((el) => el.scrollTop);

    // Scroll the right (reader) panel
    await rightScrollViewport.evaluate((el) => {
      el.scrollTop = 300;
    });

    // Left panel should not have scrolled
    const leftAfter = await leftScrollViewport.evaluate((el) => el.scrollTop);
    expect(leftAfter).toBe(leftBefore);
  });

  test("outer handle resizes sidebar vs stage", async ({ feedPage: page }) => {
    // Two-tier model: the outer ResizablePanelGroup has [sidebar, stage] —
    // the only place sidebar width changes. Drag the *first* (outer) handle
    // and assert the sidebar panel's width changed. .first() is required
    // because the default route also renders an inner group (article-list +
    // reader) with its own handle.
    await setupFeed(page);

    const outerHandle = page.locator('[data-slot="resizable-handle"]').first();
    await expect(outerHandle).toBeVisible();

    const sidebar = page.locator('[data-panel][id="sidebar"]');
    const widthBefore = await sidebar.evaluate(
      (el) => el.getBoundingClientRect().width,
    );

    const handleBox = await outerHandle.boundingBox();
    if (handleBox) {
      await page.mouse.move(
        handleBox.x + handleBox.width / 2,
        handleBox.y + handleBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        handleBox.x + handleBox.width / 2 + 80,
        handleBox.y + handleBox.height / 2,
        { steps: 10 },
      );
      await page.mouse.up();
    }

    const widthAfter = await sidebar.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    expect(Math.abs(widthAfter - widthBefore)).toBeGreaterThan(10);
  });

  test("inner handle resizes article-list vs reader, leaves sidebar alone", async ({
    feedPage: page,
  }) => {
    // The inner ResizablePanelGroup persists the article-list/reader split
    // independently of the sidebar. Dragging its handle must NOT change the
    // sidebar's width — that's the structural promise of the two-tier model.
    await setupFeed(page);

    const handles = page.locator('[data-slot="resizable-handle"]');
    await expect(handles).toHaveCount(2);
    const innerHandle = handles.nth(1);

    const sidebar = page.locator('[data-panel][id="sidebar"]');
    const articleList = page.locator('[data-panel][id="article-list"]');
    const sidebarWidthBefore = await sidebar.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    const listWidthBefore = await articleList.evaluate(
      (el) => el.getBoundingClientRect().width,
    );

    const handleBox = await innerHandle.boundingBox();
    if (handleBox) {
      await page.mouse.move(
        handleBox.x + handleBox.width / 2,
        handleBox.y + handleBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        handleBox.x + handleBox.width / 2 + 80,
        handleBox.y + handleBox.height / 2,
        { steps: 10 },
      );
      await page.mouse.up();
    }

    const sidebarWidthAfter = await sidebar.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    const listWidthAfter = await articleList.evaluate(
      (el) => el.getBoundingClientRect().width,
    );

    expect(Math.abs(listWidthAfter - listWidthBefore)).toBeGreaterThan(10);
    expect(Math.abs(sidebarWidthAfter - sidebarWidthBefore)).toBeLessThan(2);
  });

  test("sidebar collapse/expand via trigger", async ({ feedPage: page }) => {
    await setupFeed(page);

    // Sidebar should be visible initially on desktop
    const sidebar = page.locator('[data-slot="sidebar"]');
    await expect(sidebar).toBeVisible();

    // Click the sidebar trigger button (not the rail) to collapse
    const trigger = page.locator('[data-sidebar="trigger"]');
    await trigger.click({ force: true });

    // Wait for sidebar animation (duration-200) to complete
    const sidebarEl = page.locator('div[data-slot="sidebar"][data-state]');
    await expect(sidebarEl).toHaveAttribute("data-state", "collapsed", {
      timeout: 5000,
    });

    // Click again to expand
    await trigger.click({ force: true });
    await expect(sidebarEl).toHaveAttribute("data-state", "expanded", {
      timeout: 5000,
    });
  });
});

test.describe("Layout — mobile", () => {
  test.use({ viewport: { width: 393, height: 851 } });

  test("sidebar opens as offcanvas sheet", async ({ feedPage: page }) => {
    // Sidebar should not be visible initially on mobile
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeHidden();

    // Click trigger to open
    await page.getByRole("button", { name: /toggle sidebar/i }).click();

    // Should appear as a dialog (Sheet)
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Should contain the app name
    await expect(page.getByText("FeedZero")).toBeVisible();
  });

  test("sidebar closes when a feed is tapped", async ({ feedPage: page }) => {
    await setupFeedMobile(page);

    // Navigate back to a state where we can see article list
    // Then open the sidebar to tap the feed again
    await page.getByRole("button", { name: /toggle sidebar/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Tap the feed in the sidebar
    await dialog
      .locator('[data-sidebar="menu-button"]', { hasText: "Test Feed" })
      .click();

    // Sidebar should close automatically
    await expect(dialog).toBeHidden({ timeout: 5000 });

    // Article list should be visible
    await expect(articleOption(page, "First Article")).toBeVisible({
      timeout: 10000,
    });
  });

  test("header stays visible when scrolling article list", async ({
    feedPage: page,
  }) => {
    await setupFeedMobile(page);

    // Inject many items to force scroll in the content area
    await page.evaluate(() => {
      const scrollContainer = document.querySelector(
        'main [class*="overflow-y-auto"]',
      );
      if (scrollContainer) {
        const tall = document.createElement("div");
        tall.style.height = "5000px";
        tall.textContent = "Tall spacer for scroll testing";
        scrollContainer.appendChild(tall);
      }
    });

    // Scroll the content area
    await page.evaluate(() => {
      const scrollContainer = document.querySelector(
        'main [class*="overflow-y-auto"]',
      );
      if (scrollContainer) scrollContainer.scrollTop = 1000;
    });

    // Header should still be visible at the top
    const header = page.locator("header").first();
    const headerBox = await header.boundingBox();
    expect(headerBox).toBeTruthy();
    expect(headerBox!.y).toBeLessThanOrEqual(5);
  });
});
