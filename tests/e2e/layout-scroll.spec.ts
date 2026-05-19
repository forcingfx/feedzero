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
 * Adds a feed on mobile. After adding via Explore, the app already navigates
 * the user to the new feed's article list — no need to re-select via the
 * mobile drawer (it lives in MobileNavDrawer with aria-label "Open feed list",
 * not the old "Toggle Sidebar" sheet).
 */
async function setupFeedMobile(page: import("@playwright/test").Page) {
  await mockFeedEndpoint(page, SAMPLE_RSS);
  await addFeedViaUI(page, "https://example.com/feed");

  await page.waitForURL(/\/feeds\//, { timeout: 10000 });
  await expect(articleOption(page, "First Article")).toBeVisible({
    timeout: 10000,
  });
}

test.describe("Layout and scroll", () => {
  // Note: the desktop layout has no page-level pinned header — the only
  // <header> is the reader's article meta block, which scrolls inside the
  // reader panel. The mobile equivalent does pin a page header and is
  // tested in the "Layout — mobile" describe below.

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

    // Article-list panel's scroll container is the direct div child of the
    // ResizablePanel; the reader panel exposes data-testid="reader-scroll-container".
    // Neither uses Radix ScrollArea — they're plain overflow-y-auto divs.
    const listScroll = page.locator('[data-panel][id="article-list"] > div');
    const readerScroll = page.getByTestId("reader-scroll-container");

    const readerBefore = await readerScroll.evaluate((el) => el.scrollTop);

    await listScroll.evaluate((el) => {
      el.scrollTop = 200;
    });

    const readerAfter = await readerScroll.evaluate((el) => el.scrollTop);
    expect(readerAfter).toBe(readerBefore);
  });

  test("reader scrolls independently", async ({ feedPage: page }) => {
    await setupFeed(page);

    // Inject tall content into the reader so it has somewhere to scroll to.
    await page.evaluate(() => {
      const article = document.querySelector("article");
      if (article) {
        const tall = document.createElement("div");
        tall.style.height = "5000px";
        article.appendChild(tall);
      }
    });

    const listScroll = page.locator('[data-panel][id="article-list"] > div');
    const readerScroll = page.getByTestId("reader-scroll-container");

    const listBefore = await listScroll.evaluate((el) => el.scrollTop);

    await readerScroll.evaluate((el) => {
      el.scrollTop = 300;
    });

    const listAfter = await listScroll.evaluate((el) => el.scrollTop);
    expect(listAfter).toBe(listBefore);
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

  // Note: there is no "sidebar collapse via trigger" test. The desktop
  // sidebar uses collapsible="none" — it's a static ResizablePanel that
  // users resize via the drag handle (covered by the outer-handle test
  // above). No SidebarTrigger is rendered. See ADR 013.
});

test.describe("Layout — mobile", () => {
  test.use({ viewport: { width: 393, height: 851 } });

  test("nav drawer opens when the handle is tapped", async ({
    feedPage: page,
  }) => {
    // Mobile feed nav is a Vaul bottom drawer (MobileNavDrawer), not the
    // desktop Sidebar's offcanvas sheet. The trigger is a button with
    // aria-label "Open feed list"; the content lives under
    // data-testid="drawer-content".
    const drawerContent = page.getByTestId("drawer-content");
    await expect(drawerContent).toBeHidden();

    await page.getByRole("button", { name: /open feed list/i }).click();

    await expect(drawerContent).toBeVisible({ timeout: 5000 });
    await expect(drawerContent.getByText("Settings")).toBeVisible();
  });

  test("nav drawer closes when a feed is tapped", async ({
    feedPage: page,
  }) => {
    await setupFeedMobile(page);

    await page.getByRole("button", { name: /open feed list/i }).click();
    const drawerContent = page.getByTestId("drawer-content");
    await expect(drawerContent).toBeVisible({ timeout: 5000 });

    await drawerContent
      .locator('[data-sidebar="menu-button"]', { hasText: "Test Feed" })
      .click();

    await expect(drawerContent).toBeHidden({ timeout: 5000 });

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
