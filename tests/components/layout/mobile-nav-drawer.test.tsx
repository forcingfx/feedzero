import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="probe-path">{pathname + search}</div>;
}

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateArticle: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
  updateFeed: vi.fn(),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));

const makeFeed = (id: string, title: string) => ({
  id,
  url: `https://example.com/${id}`,
  title,
  description: "",
  siteUrl: "https://example.com",
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

function renderDrawer(props: Partial<{ onFeedSelect: (id: string) => void }> = {}) {
  return render(
    <MemoryRouter initialEntries={["/feeds"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <MobileNavDrawer onFeedSelect={props.onFeedSelect ?? vi.fn()} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MobileNavDrawer", () => {
  beforeEach(() => {
    useFeedStore.setState({
      feeds: [],
      selectedFeedId: null,
      recentFeedIds: [],
      isLoading: false,
      error: null,
      isRefreshingAll: false,
      refreshingFeedIds: new Set(),
    });
    useArticleStore.setState({
      articles: [],
      articlesByFeedId: {},
      selectedArticle: null,
      isLoading: false,
    });
  });

  it("renders a handle strip that is always present in the DOM", () => {
    const { container } = renderDrawer();
    expect(container.ownerDocument.querySelector("[data-testid='drawer-handle-strip']")).not.toBeNull();
  });

  describe("closed handle strip iOS clearance", () => {
    // The strip sits at the bottom of the viewport on mobile (parent is
    // `h-dvh` and the strip is the last child). Without safe-area handling,
    // the iOS home indicator overlays the dock buttons and the device's
    // rounded display corners clip the leftmost/rightmost favicons. These
    // tests pin both: vertical clearance for the home indicator (and the
    // iOS Safari toolbar shadow on dynamic-viewport switches) and
    // horizontal clearance for landscape notch / rounded corners.

    it("extends height with env(safe-area-inset-bottom) so dock buttons clear the iOS home indicator", () => {
      renderDrawer();
      const strip = screen.getByTestId("drawer-handle-strip");
      // The strip's content area must stay 60px (so taps still land on
      // the dock buttons), but its total height grows by the home-indicator
      // inset. A `pb-[env(safe-area-inset-bottom)]` paired with a height
      // expression that includes the same env() is the recipe; here we
      // assert structurally on the env() token's presence.
      expect(strip.className).toMatch(/safe-area-inset-bottom/);
    });

    it("includes env(safe-area-inset-left) and env(safe-area-inset-right) so edge buttons clear rounded corners / landscape notch", () => {
      renderDrawer();
      const strip = screen.getByTestId("drawer-handle-strip");
      expect(strip.className).toMatch(/safe-area-inset-left/);
      expect(strip.className).toMatch(/safe-area-inset-right/);
    });
  });

  /**
   * Audit 2026-Q4, round 2, rule 5. The closed strip is a standard
   * four-tab bar (Feeds, Explore, Signal, Settings) instead of a
   * favicon dock plus two shortcuts plus a chevron: every tab has a
   * label, the current section is marked, and recent feeds move to the
   * first row of the open drawer. Needs the owner's phone check.
   */
  describe("closed-state tab bar", () => {
    it("shows exactly four labelled tabs: Feeds, Explore, Signal, Settings", () => {
      useFeedStore.setState({ feeds: [makeFeed("f1", "Hacker News")], recentFeedIds: ["f1"] });
      renderDrawer();
      const strip = screen.getByTestId("drawer-handle-strip");
      const labels = within(strip).getAllByRole("button").map((b) => b.textContent?.trim());
      expect(labels).toEqual(["Feeds", "Explore", "Signal", "Settings"]);
      // No favicon buttons in the strip any more.
      expect(within(strip).queryByRole("button", { name: "Hacker News" })).toBeNull();
    });

    it("the Feeds tab opens the drawer", async () => {
      const user = userEvent.setup();
      useFeedStore.setState({ feeds: [makeFeed("f1", "Hacker News")] });
      renderDrawer();
      await user.click(screen.getByRole("button", { name: /open feed list/i }));
      await waitFor(() => expect(screen.getByTestId("drawer-content")).toBeInTheDocument());
    });

    it("marks the current section with aria-current", () => {
      useFeedStore.setState({ feeds: [makeFeed("f1", "Hacker News")] });
      renderDrawer();
      const strip = screen.getByTestId("drawer-handle-strip");
      expect(within(strip).getByRole("button", { name: /open feed list/i })).toHaveAttribute("aria-current", "page");
      expect(within(strip).getByRole("button", { name: /explore/i })).not.toHaveAttribute("aria-current");
    });

    it("tabs meet the 44px tap-target floor", () => {
      useFeedStore.setState({ feeds: [makeFeed("f1", "Feed 1")] });
      renderDrawer();
      const strip = screen.getByTestId("drawer-handle-strip");
      for (const btn of within(strip).getAllByRole("button")) {
        expect(btn.className).toMatch(/\bh-11\b|\bsize-11\b/);
      }
    });

    it("swiping up on the strip opens the drawer (the handle pill advertises it)", async () => {
      useFeedStore.setState({ feeds: [makeFeed("f1", "Feed 1")] });
      renderDrawer();
      const strip = screen.getByTestId("drawer-handle-strip");

      const touch = (type: string, y: number) =>
        strip.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches:
              type === "touchend"
                ? []
                : [new Touch({ identifier: 1, target: strip, clientX: 200, clientY: y })],
          }),
        );

      touch("touchstart", 800);
      touch("touchmove", 760);
      touch("touchend", 760);

      await waitFor(() => {
        expect(screen.getByTestId("drawer-content")).toBeInTheDocument();
      });
    });

    it("Explore, Signal and Settings navigate without opening the drawer", async () => {
      const user = userEvent.setup();
      useFeedStore.setState({ feeds: [makeFeed("f1", "Feed 1")] });
      renderDrawer();
      const strip = screen.getByTestId("drawer-handle-strip");

      await user.click(within(strip).getByRole("button", { name: /explore/i }));
      expect(screen.getByTestId("probe-path")).toHaveTextContent("/explore");
      await user.click(within(strip).getByRole("button", { name: /signal/i }));
      expect(screen.getByTestId("probe-path")).toHaveTextContent("/signal");
      await user.click(within(strip).getByRole("button", { name: /settings/i }));
      expect(screen.getByTestId("probe-path")).toHaveTextContent("/settings");
      expect(screen.queryByTestId("drawer-content")).toBeNull();
    });
  });

  describe("recent feeds row in the open drawer", () => {
    async function openDrawer() {
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /open feed list/i }));
      await waitFor(() => expect(screen.getByTestId("drawer-content")).toBeInTheDocument());
      return user;
    }

    it("shows the most-recently-viewed feeds as favicon buttons, in stable sidebar order", async () => {
      useFeedStore.setState({
        feeds: [makeFeed("f1", "Alpha"), makeFeed("f2", "Bravo"), makeFeed("f3", "Charlie")],
        recentFeedIds: ["f3", "f1"],
      });
      renderDrawer();
      await openDrawer();
      const row = screen.getByTestId("drawer-recent-feeds");
      const labels = within(row).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
      expect(labels).toEqual(["Alpha", "Charlie"]);
    });

    it("tapping a recent feed selects it (and the drawer closes, like any row)", async () => {
      const onFeedSelect = vi.fn();
      useFeedStore.setState({ feeds: [makeFeed("f1", "Alpha")], recentFeedIds: ["f1"] });
      renderDrawer({ onFeedSelect });
      const user = await openDrawer();
      await user.click(within(screen.getByTestId("drawer-recent-feeds")).getByRole("button", { name: "Alpha" }));
      expect(onFeedSelect).toHaveBeenCalledWith("f1");
    });

    it("is absent when nothing has been viewed yet", async () => {
      useFeedStore.setState({ feeds: [makeFeed("f1", "Alpha")], recentFeedIds: [] });
      renderDrawer();
      await openDrawer();
      expect(screen.queryByTestId("drawer-recent-feeds")).toBeNull();
    });
  });

  it("drawer footer carries the full 'Refreshed X ago' status (moved out of the header)", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({
      feeds: [makeFeed("f1", "Feed 1")],
      lastRefreshAllAt: Date.now() - 5 * 60 * 1000,
    });
    renderDrawer();

    await user.click(screen.getByRole("button", { name: /open feed list/i }));

    const drawer = await screen.findByTestId("drawer-content");
    expect(within(drawer).getByText(/refreshed .* ago/i)).toBeInTheDocument();
  });

  it("renders 'All items' entry when drawer is open and there are feeds", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Feed One")] });
    renderDrawer();
    await user.click(screen.getByRole("button", { name: /open feed list/i }));
    expect(await screen.findByText("All items")).toBeInTheDocument();
  });

  it("carries no Explore or Signal rows: the tab bar owns those sections", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Test Feed")] });
    renderDrawer();
    await user.click(screen.getByRole("button", { name: /open feed list/i }));
    const content = await screen.findByTestId("drawer-content");
    expect(within(content).queryByText("Explore")).toBeNull();
    expect(within(content).queryByText("Signal")).toBeNull();
  });

  it("calls onFeedSelect with ALL_FEEDS_ID when All items is tapped", async () => {
    const user = userEvent.setup();
    const onFeedSelect = vi.fn();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Feed One")] });
    renderDrawer({ onFeedSelect });
    await user.click(screen.getByRole("button", { name: /open feed list/i }));
    await user.click(await screen.findByText("All items"));
    expect(onFeedSelect).toHaveBeenCalledWith("all");
  });

  it("renders feed names from the store when drawer is open", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Hacker News"), makeFeed("f2", "The Verge")] });
    renderDrawer();
    await user.click(screen.getByRole("button", { name: /open feed list/i }));
    expect(await screen.findByText("Hacker News")).toBeInTheDocument();
    expect(screen.getByText("The Verge")).toBeInTheDocument();
  });

  it("calls onFeedSelect with the correct feedId when a feed is tapped", async () => {
    const user = userEvent.setup();
    const onFeedSelect = vi.fn();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Hacker News")] });
    renderDrawer({ onFeedSelect });
    await user.click(screen.getByRole("button", { name: /open feed list/i }));
    await user.click(await screen.findByText("Hacker News"));
    expect(onFeedSelect).toHaveBeenCalledWith("f1");
  });

  it("drawer content stacks vertically (no horizontal flex layout from SidebarProvider)", async () => {
    const user = userEvent.setup();
    const { container } = renderDrawer();
    await user.click(screen.getByRole("button", { name: /open feed list/i }));

    const wrapper = await waitFor(() => {
      const w = container.ownerDocument.querySelector("[data-slot='sheet-content'], [data-slot='drawer-content'], [data-testid='drawer-content']");
      if (!w) throw new Error("drawer content not yet mounted");
      return w;
    });
    const sidebarWrapper = wrapper.querySelector("[data-slot='sidebar-wrapper']");
    expect(sidebarWrapper).not.toBeNull();
    // SidebarProvider's default is `flex min-h-svh w-full` (row layout) —
    // must be overridden inside the drawer so the scroll + the pinned
    // Settings footer stack vertically. We allow `flex` here because the
    // drawer needs `flex flex-col` to split the height between the
    // scrollable area and the footer; the row default is denied by the
    // explicit `flex-col` and by clearing `min-h-svh`.
    expect(sidebarWrapper!.className).toContain("flex-col");
    expect(sidebarWrapper!.className).not.toContain("min-h-svh");
  });

  it("renders a 'Refresh all' row that refreshes every feed when feeds exist", async () => {
    const { refreshAllFeeds } = await import("@/core/feeds/feed-service.ts");
    const user = userEvent.setup();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Test Feed")] });
    renderDrawer();
    await user.click(screen.getByRole("button", { name: /open feed list/i }));

    const refreshBtn = await screen.findByTestId("drawer-refresh-all");
    await user.click(refreshBtn);

    expect(refreshAllFeeds).toHaveBeenCalled();
  });

  it("hides the 'Refresh all' row when there are no feeds", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feeds: [] });
    renderDrawer();
    await user.click(screen.getByRole("button", { name: /open feed list/i }));
    // The footer's New folder is always present; the refresh row is feed-gated.
    await screen.findByRole("button", { name: "New folder" });
    expect(screen.queryByTestId("drawer-refresh-all")).toBeNull();
  });

  it("drawer body content has horizontal padding so feed/settings rows don't run edge-to-edge", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Test Feed")] });
    const { container } = renderDrawer();
    await user.click(screen.getByRole("button", { name: /open feed list/i }));

    const drawer = await waitFor(() => {
      const d = container.ownerDocument.querySelector(
        "[data-testid='drawer-content']",
      );
      if (!d) throw new Error("drawer not mounted");
      return d;
    });
    // Both the feed nav body and the settings list must sit inside a wrapper
    // with horizontal padding so the rows don't touch the screen edges. The
    // feed-nav section lives inside the scrollable area; the settings row is
    // pinned outside the scroll (fixed footer) so it's always reachable
    // regardless of feed count.
    const paddedSections = drawer.querySelectorAll(
      "[data-testid='drawer-section']",
    );
    expect(paddedSections.length).toBeGreaterThanOrEqual(2);
    for (const section of paddedSections) {
      expect(section.className).toMatch(/\bpx-\d/);
    }
  });

  it("'New folder' stays pinned outside the scroll so it's reachable with many feeds", async () => {
    // Always-reachable invariant (2026-05-19 bug report): with a 50-feed list,
    // a power user shouldn't have to scroll past every feed to reach
    // folder management. NewFolderInput renders inside SidebarFeedList
    // by default; the mobile drawer suppresses that and renders its own
    // copy in the pinned footer.
    const user = userEvent.setup();
    useFeedStore.setState({
      feeds: Array.from({ length: 50 }, (_, i) =>
        makeFeed(`f${i}`, `Feed ${i}`),
      ),
    });
    const { container } = renderDrawer();
    await user.click(screen.getByRole("button", { name: /open feed list/i }));

    const drawer = await waitFor(() => {
      const d = container.ownerDocument.querySelector(
        "[data-testid='drawer-content']",
      );
      if (!d) throw new Error("drawer not mounted");
      return d;
    });
    const scroll = drawer.querySelector("[data-testid='drawer-scroll']");

    // The "New folder" entry-point button (collapsed state). Exactly one
    // instance must render inside the drawer — duplication would mean
    // SidebarFeedList wasn't told to suppress its copy.
    const newFolderButtons = await screen.findAllByRole("button", {
      name: "New folder",
    });
    expect(newFolderButtons).toHaveLength(1);
    const newFolderBtn = newFolderButtons[0];

    expect(scroll).not.toBeNull();
    expect(scroll!.contains(newFolderBtn)).toBe(false);
    expect(drawer.contains(newFolderBtn)).toBe(true);
  });

  it("drawer scroll container prevents horizontal scrolling", async () => {
    const user = userEvent.setup();
    const { container } = renderDrawer();
    await user.click(screen.getByRole("button", { name: /open feed list/i }));
    const scroll = await waitFor(() => {
      const s = container.ownerDocument.querySelector("[data-testid='drawer-scroll']");
      if (!s) throw new Error("scroll not mounted");
      return s;
    });
    expect(scroll.className).toContain("overflow-x-hidden");
  });

  it("pinned footer pads for the home indicator only, so it never squeezes the feed list", async () => {
    // Trade-off: the footer sits between the feed list and Safari's
    // toolbar, and Safari already lays the fixed drawer out above that
    // toolbar. Padding the footer by (100vh - 100dvh) as well added a
    // toolbar's height of dead space (~200px on an iPhone, user report
    // 2026-09-28) that the fixed-height drawer took from the feed list,
    // pushing every feed below the fold. The footer pads like the closed
    // dock strip: env(safe-area-inset-bottom) alone. If a real device
    // ever shows the footer under the toolbar, fix the drawer's anchoring,
    // not this padding.
    const user = userEvent.setup();
    const { container } = renderDrawer();
    await user.click(screen.getByRole("button", { name: /open feed list/i }));
    const newFolderBtn = await screen.findByRole("button", { name: "New folder" });
    const drawer = container.ownerDocument.querySelector("[data-testid='drawer-content']")!;
    const footer = [...drawer.querySelectorAll("[data-testid='drawer-section']")].find(
      (section) => section.contains(newFolderBtn),
    )!;

    expect(footer.className).toContain("safe-area-inset-bottom");
    expect(footer.className).not.toMatch(/100vh[\s_]*-[\s_]*100dvh/);
  });

  it("feed list scroll carries no bottom-edge insets: the pinned footer owns that clearance", async () => {
    // Trade-off: the scroll used to pad by env(safe-area-inset-bottom) +
    // (100vh - 100dvh) from when its bottom WAS the screen edge
    // (2026-05-13 toolbar-occlusion report). Since the footer was pinned
    // below it, that padding only bought dead space, and once the drawer
    // became content-sized (2026-11-02 report) the dead space showed as a
    // blank gap under a short feed list. Occlusion is guarded on the
    // footer instead ("pinned footer pads for the home indicator only").
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole("button", { name: /open feed list/i }));
    const scroll = await screen.findByTestId("drawer-scroll");
    expect(scroll.className).not.toContain("safe-area-inset-bottom");
    expect(scroll.className).not.toMatch(/100vh[\s_]*-[\s_]*100dvh/);
  });

  describe("lean footer and content-sized drawer (2026-11-02 report)", () => {
    // The open drawer spent ~200px on three full-width rows (New folder,
    // Refresh all, Settings) and was a fixed 85dvh tall, so a short feed
    // list sat above a large blank gap. The footer is now one icon row and
    // the drawer sizes to its content, capped at 85dvh.

    async function openDrawer() {
      const user = userEvent.setup();
      renderDrawer();
      await user.click(screen.getByRole("button", { name: /open feed list/i }));
      return { user, drawer: await screen.findByTestId("drawer-content") };
    }

    it("puts New folder and Refresh all on a single icon row (Settings lives in the tab bar)", async () => {
      useFeedStore.setState({ feeds: [makeFeed("f1", "Feed 1")] });
      const { drawer } = await openDrawer();
      const row = within(drawer).getByTestId("drawer-footer-actions");
      expect(within(row).queryByRole("button", { name: /^settings$/i })).toBeNull();
      for (const name of [/new folder/i, /refresh all/i]) {
        const btn = within(row).getByRole("button", { name });
        // Icon-only: the accessible name lives in aria-label, no visible text.
        expect(btn.textContent?.trim()).toBe("");
      }
    });

    it("keeps the refresh/sync status on the same row as the actions", async () => {
      useFeedStore.setState({
        feeds: [makeFeed("f1", "Feed 1")],
        lastRefreshAllAt: Date.now() - 5 * 60 * 1000,
      });
      const { drawer } = await openDrawer();
      const row = within(drawer).getByTestId("drawer-footer-actions");
      expect(within(row).getByText(/refreshed .* ago/i)).toBeInTheDocument();
    });

    it("footer action buttons meet the 44px tap-target floor (size-11)", async () => {
      useFeedStore.setState({ feeds: [makeFeed("f1", "Feed 1")] });
      const { drawer } = await openDrawer();
      const row = within(drawer).getByTestId("drawer-footer-actions");
      for (const name of [/new folder/i, /refresh all/i]) {
        expect(within(row).getByRole("button", { name }).className).toContain("size-11");
      }
    });

    it("tapping the New folder icon reveals the folder name input", async () => {
      useFeedStore.setState({ feeds: [makeFeed("f1", "Feed 1")] });
      const { user, drawer } = await openDrawer();
      await user.click(within(drawer).getByRole("button", { name: /new folder/i }));
      expect(within(drawer).getByPlaceholderText("Folder name")).toHaveFocus();
    });

    it("sizes to its content, capped at 85dvh, instead of a fixed 85dvh height", async () => {
      const { drawer } = await openDrawer();
      const style = (drawer as HTMLElement).style;
      expect(style.maxHeight).toBe("85dvh");
      expect(style.height).toBe("");
    });
  });

  it("toggles open when feedzero:toggle-sidebar event is dispatched", async () => {
    const { container } = renderDrawer();
    const doc = container.ownerDocument;
    expect(screen.queryByTestId("drawer-content")).toBeNull();

    doc.dispatchEvent(new CustomEvent("feedzero:toggle-sidebar"));

    await waitFor(() => {
      expect(screen.getByTestId("drawer-content")).toBeInTheDocument();
    });
  });

  /**
   * Liquid-glass tab bar (owner request, 2026-11-10; Apple HIG, Tab bars,
   * iOS): the bar floats above content as a glass capsule, minimizes to
   * the current tab at the bottom-left while content scrolls down, and
   * leaves the minimized state when that tab is tapped or content scrolls
   * back up. Scrolling inside the reader or the open drawer is ignored.
   */
  describe("liquid-glass capsule", () => {
    function renderWithPage() {
      useFeedStore.setState({ feeds: [makeFeed("f1", "Feed 1")] });
      return render(
        <MemoryRouter initialEntries={["/feeds"]}>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  <div data-testid="page-scroller" style={{ overflowY: "auto" }} />
                  <div data-reader-layer><div data-testid="reader-scroller" /></div>
                  <MobileNavDrawer onFeedSelect={vi.fn()} />
                  <LocationProbe />
                </>
              }
            />
          </Routes>
        </MemoryRouter>,
      );
    }
    function scroll(el: HTMLElement, top: number) {
      Object.defineProperty(el, "scrollTop", { value: top, configurable: true, writable: true });
      fireEvent.scroll(el);
    }
    const strip = () => screen.getByTestId("drawer-handle-strip");

    it("floats as a glass capsule and leaves the rest of the strip to the content", () => {
      renderWithPage();
      expect(strip().className).toContain("pointer-events-none");
      const capsule = screen.getByTestId("tab-capsule");
      expect(capsule.className).toContain("liquid-glass");
      expect(capsule.className).toContain("rounded-full");
      expect(capsule.className).toContain("pointer-events-auto");
    });

    it("minimizes to the current tab when the page scrolls down", () => {
      renderWithPage();
      scroll(screen.getByTestId("page-scroller"), 300);
      expect(strip()).toHaveAttribute("data-minimized", "true");
      const buttons = within(strip()).getAllByRole("button");
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveAccessibleName(/feeds/i);
    });

    it("tapping the minimized tab brings the full bar back", async () => {
      const user = userEvent.setup();
      renderWithPage();
      scroll(screen.getByTestId("page-scroller"), 300);
      await user.click(within(strip()).getByRole("button", { name: /feeds/i }));
      expect(strip()).toHaveAttribute("data-minimized", "false");
      expect(within(strip()).getAllByRole("button")).toHaveLength(4);
    });

    it("scrolling back up brings the full bar back", () => {
      renderWithPage();
      const page = screen.getByTestId("page-scroller");
      scroll(page, 300);
      scroll(page, 250);
      expect(strip()).toHaveAttribute("data-minimized", "false");
    });

    it("ignores scrolling inside the reader", () => {
      renderWithPage();
      scroll(screen.getByTestId("reader-scroller"), 300);
      expect(strip()).toHaveAttribute("data-minimized", "false");
    });
  });
});
