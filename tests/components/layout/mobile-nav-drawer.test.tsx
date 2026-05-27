import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

  describe("closed-state quick-switch dock", () => {
    it("shows the selected feed's favicons in the closed strip (no drawer open needed)", () => {
      useFeedStore.setState({
        feeds: [makeFeed("f1", "Hacker News"), makeFeed("f2", "The Verge")],
        recentFeedIds: ["f1", "f2"],
      });
      renderDrawer();
      const strip = screen.getByTestId("drawer-handle-strip");
      // Favicon buttons are labelled by feed title and present while closed.
      expect(within(strip).getByRole("button", { name: "Hacker News" })).toBeInTheDocument();
      expect(within(strip).getByRole("button", { name: "The Verge" })).toBeInTheDocument();
    });

    it("anchors an All-items quick button in the closed strip", () => {
      useFeedStore.setState({ feeds: [makeFeed("f1", "Hacker News")] });
      renderDrawer();
      const strip = screen.getByTestId("drawer-handle-strip");
      expect(within(strip).getByRole("button", { name: "All items" })).toBeInTheDocument();
    });

    it("switches feed when a dock favicon is tapped, without opening the drawer", async () => {
      const user = userEvent.setup();
      const onFeedSelect = vi.fn();
      useFeedStore.setState({ feeds: [makeFeed("f1", "Hacker News")], recentFeedIds: ["f1"] });
      renderDrawer({ onFeedSelect });

      const strip = screen.getByTestId("drawer-handle-strip");
      await user.click(within(strip).getByRole("button", { name: "Hacker News" }));

      expect(onFeedSelect).toHaveBeenCalledWith("f1");
      // Drawer stays closed: the open-chevron must not be rotated.
      expect(screen.getByTestId("drawer-open-chevron").className).not.toContain("rotate-180");
    });

    it("switches to All items when the anchored dock button is tapped", async () => {
      const user = userEvent.setup();
      const onFeedSelect = vi.fn();
      useFeedStore.setState({ feeds: [makeFeed("f1", "Hacker News")] });
      renderDrawer({ onFeedSelect });

      const strip = screen.getByTestId("drawer-handle-strip");
      await user.click(within(strip).getByRole("button", { name: "All items" }));

      expect(onFeedSelect).toHaveBeenCalledWith("all");
    });

    it("orders dock favicons most-recently-viewed first", () => {
      useFeedStore.setState({
        feeds: [makeFeed("f1", "Alpha"), makeFeed("f2", "Bravo"), makeFeed("f3", "Charlie")],
        recentFeedIds: ["f3", "f1"],
      });
      renderDrawer();
      const strip = screen.getByTestId("drawer-handle-strip");
      const labels = within(strip)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label"));
      // After the anchored "All items", recency order wins: f3, f1, then the
      // never-viewed f2; the open-list chevron trails.
      expect(labels).toEqual([
        "All items",
        "Charlie",
        "Alpha",
        "Bravo",
        "Open feed list",
      ]);
    });

    it("caps the number of dock favicons and leaves the rest behind the full list", () => {
      useFeedStore.setState({
        feeds: Array.from({ length: 20 }, (_, i) => makeFeed(`f${i}`, `Feed ${i}`)),
      });
      renderDrawer();
      const strip = screen.getByTestId("drawer-handle-strip");
      const faviconButtons = within(strip)
        .getAllByRole("button")
        .filter((b) => /^Feed \d+$/.test(b.getAttribute("aria-label") ?? ""));
      expect(faviconButtons.length).toBeLessThanOrEqual(6);
      expect(faviconButtons.length).toBeGreaterThan(0);
    });

    it("marks the active feed's dock button as pressed", () => {
      useFeedStore.setState({
        feeds: [makeFeed("f1", "Hacker News")],
        recentFeedIds: ["f1"],
        selectedFeedId: "f1",
      });
      renderDrawer();
      const strip = screen.getByTestId("drawer-handle-strip");
      expect(
        within(strip).getByRole("button", { name: "Hacker News" }),
      ).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("renders 'All items' entry when drawer is open and there are feeds", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Feed One")] });
    renderDrawer();
    await user.click(screen.getByRole("button", { name: "Open feed list" }));
    expect(await screen.findByText("All items")).toBeInTheDocument();
  });

  it("renders an Explore entry that navigates to the explore catalog", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole("button", { name: "Open feed list" }));
    const explore = await screen.findByText("Explore");
    expect(explore).toBeInTheDocument();
    // The button should be reachable via role
    expect(explore.closest("button, a")).not.toBeNull();
  });

  it("calls onFeedSelect with ALL_FEEDS_ID when All items is tapped", async () => {
    const user = userEvent.setup();
    const onFeedSelect = vi.fn();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Feed One")] });
    renderDrawer({ onFeedSelect });
    await user.click(screen.getByRole("button", { name: "Open feed list" }));
    await user.click(await screen.findByText("All items"));
    expect(onFeedSelect).toHaveBeenCalledWith("all");
  });

  it("renders feed names from the store when drawer is open", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Hacker News"), makeFeed("f2", "The Verge")] });
    renderDrawer();
    await user.click(screen.getByRole("button", { name: "Open feed list" }));
    expect(await screen.findByText("Hacker News")).toBeInTheDocument();
    expect(screen.getByText("The Verge")).toBeInTheDocument();
  });

  it("calls onFeedSelect with the correct feedId when a feed is tapped", async () => {
    const user = userEvent.setup();
    const onFeedSelect = vi.fn();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Hacker News")] });
    renderDrawer({ onFeedSelect });
    await user.click(screen.getByRole("button", { name: "Open feed list" }));
    await user.click(await screen.findByText("Hacker News"));
    expect(onFeedSelect).toHaveBeenCalledWith("f1");
  });

  it("drawer content stacks vertically (no horizontal flex layout from SidebarProvider)", async () => {
    const user = userEvent.setup();
    const { container } = renderDrawer();
    await user.click(screen.getByRole("button", { name: "Open feed list" }));

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

  it("scrollable feed list area has bottom padding to clear iOS Safari browser chrome", async () => {
    const user = userEvent.setup();
    const { container } = renderDrawer();
    await user.click(screen.getByRole("button", { name: "Open feed list" }));

    const drawer = await waitFor(() => {
      const d = container.ownerDocument.querySelector("[data-testid='drawer-content']");
      if (!d) throw new Error("drawer not mounted");
      return d;
    });
    // The scroll container's bottom padding must respect the safe-area inset so the
    // new-folder input isn't hidden behind the iOS URL bar after rubber-banding.
    const safeAreaPadded = drawer.querySelector("[data-testid='drawer-scroll']");
    expect(safeAreaPadded).not.toBeNull();
    expect(safeAreaPadded!.className).toContain("safe-area-inset-bottom");
  });

  it("renders a single Settings entry that navigates to /settings", async () => {
    // The drawer footer no longer inlines individual settings items. Tapping
    // Settings now navigates to the stage page at /settings — one tap, one
    // destination — rather than opening a centered modal.
    const user = userEvent.setup();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Test Feed")] });
    renderDrawer();
    await user.click(screen.getByRole("button", { name: "Open feed list" }));

    const settingsBtn = await screen.findByRole("button", { name: "Settings" });
    await user.click(settingsBtn);

    expect(screen.getByTestId("probe-path")).toHaveTextContent("/settings");
  });

  it("renders a 'Refresh all' row that refreshes every feed when feeds exist", async () => {
    const { refreshAllFeeds } = await import("@/core/feeds/feed-service.ts");
    const user = userEvent.setup();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Test Feed")] });
    renderDrawer();
    await user.click(screen.getByRole("button", { name: "Open feed list" }));

    const refreshBtn = await screen.findByTestId("drawer-refresh-all");
    await user.click(refreshBtn);

    expect(refreshAllFeeds).toHaveBeenCalled();
  });

  it("hides the 'Refresh all' row when there are no feeds", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feeds: [] });
    renderDrawer();
    await user.click(screen.getByRole("button", { name: "Open feed list" }));
    // Settings is always present; refresh row is feed-gated.
    await screen.findByRole("button", { name: "Settings" });
    expect(screen.queryByTestId("drawer-refresh-all")).toBeNull();
  });

  it("drawer body content has horizontal padding so feed/settings rows don't run edge-to-edge", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Test Feed")] });
    const { container } = renderDrawer();
    await user.click(screen.getByRole("button", { name: "Open feed list" }));

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

  it("Settings stays pinned outside the scroll container so it's reachable with many feeds", async () => {
    // 2026-05-19 bug report: with a long feed list, the inner scroll
    // wasn't reaching the Settings row at the bottom — vaul's snap-point
    // mode intercepts vertical drags before the inner scroll can run
    // them. Fixing the scroll is one half (remove snapPoints below);
    // pinning Settings as a fixed drawer footer is the other half — even
    // if scroll regresses again, Settings stays accessible. Belt and
    // suspenders for the always-reachable invariant.
    const user = userEvent.setup();
    useFeedStore.setState({
      feeds: Array.from({ length: 50 }, (_, i) =>
        makeFeed(`f${i}`, `Feed ${i}`),
      ),
    });
    const { container } = renderDrawer();
    await user.click(screen.getByRole("button", { name: "Open feed list" }));

    const drawer = await waitFor(() => {
      const d = container.ownerDocument.querySelector(
        "[data-testid='drawer-content']",
      );
      if (!d) throw new Error("drawer not mounted");
      return d;
    });
    const scroll = drawer.querySelector("[data-testid='drawer-scroll']");
    const settingsBtn = await screen.findByRole("button", { name: "Settings" });

    // The Settings button must not be a descendant of the scrollable area;
    // it lives in the drawer's pinned footer alongside (but not inside)
    // the scroll.
    expect(scroll).not.toBeNull();
    expect(scroll!.contains(settingsBtn)).toBe(false);
    expect(drawer.contains(settingsBtn)).toBe(true);
  });

  it("'New folder' affordance also stays pinned outside the scroll so it's reachable with many feeds", async () => {
    // Same always-reachable invariant as Settings: with a 50-feed list,
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
    await user.click(screen.getByRole("button", { name: "Open feed list" }));

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
    await user.click(screen.getByRole("button", { name: "Open feed list" }));
    const scroll = await waitFor(() => {
      const s = container.ownerDocument.querySelector("[data-testid='drawer-scroll']");
      if (!s) throw new Error("scroll not mounted");
      return s;
    });
    expect(scroll.className).toContain("overflow-x-hidden");
  });

  describe("browser-chrome occlusion fix (permanent regression guard)", () => {
    // Context (2026-05-13 second mobile bug report): on iOS Safari with the
    // bottom toolbar visible, the drawer's bottom content was hidden behind
    // the toolbar. The outer Drawer.Content is positioned by vaul (which
    // overrides any inline `bottom`/`height` style we pass), so the fix
    // lives on the INNER scroll container's `padding-bottom`. The previous
    // fix used `env(safe-area-inset-bottom) + 2rem` — that covers the
    // home-indicator strip but the fixed `2rem` is too small for iOS
    // Safari's dynamic bottom toolbar (~70-80px on iPhones).
    //
    // Permanent fix: extend the padding-bottom to include
    //   `calc(100vh - 100dvh)`
    // which evaluates to the toolbar height when the iOS Safari toolbar is
    // visible and 0 when it isn't. Combined with the existing
    // `env(safe-area-inset-bottom)` for the home indicator and the visual
    // `2rem` breathing room, the last scrollable item is always reachable.
    //
    // These tests pin the CSS expression shape structurally. happy-dom
    // doesn't compute the visual viewport, so we assert the expression is
    // present rather than the resolved pixel offset.

    async function getDrawerScroll(): Promise<HTMLElement> {
      const { container } = renderDrawer();
      await userEvent.click(screen.getByRole("button", { name: "Open feed list" }));
      const scroll = await waitFor(() => {
        const s = container.ownerDocument.querySelector(
          "[data-testid='drawer-scroll']",
        );
        if (!s) throw new Error("drawer scroll not mounted");
        return s as HTMLElement;
      });
      return scroll;
    }

    it("inner scroll padding-bottom includes env(safe-area-inset-bottom) for the iOS home indicator", async () => {
      const scroll = await getDrawerScroll();
      expect(scroll.getAttribute("class") ?? "").toContain(
        "safe-area-inset-bottom",
      );
    });

    it("inner scroll padding-bottom includes (100vh - 100dvh) for the iOS Safari bottom toolbar", async () => {
      // The bug we're preventing: a previous version used only
      // `env(safe-area-inset-bottom) + 2rem` which left the last drawer
      // item occluded by the iOS Safari toolbar (~75px). The fix adds
      // `(100vh - 100dvh)` so the padding grows with the toolbar.
      // Tailwind arbitrary values use `_` to escape spaces in className
      // tokens — the regex tolerates either separator.
      const scroll = await getDrawerScroll();
      expect(scroll.getAttribute("class") ?? "").toMatch(
        /100vh[\s_]*-[\s_]*100dvh/,
      );
    });

    it("padding-bottom is delivered via Tailwind arbitrary-value `pb-[calc(...)]` (not split into multiple utilities)", async () => {
      // Pins the single-source-of-truth shape: the entire expression is in
      // ONE `pb-[calc(…)]` token. A future "let's split this into a CSS
      // var" refactor would still need to surface the safe-area + toolbar
      // expressions somewhere; this test fails if the `pb-[calc(...)]`
      // token disappears entirely so the reviewer is forced to confirm
      // the alternative form covers both insets.
      const scroll = await getDrawerScroll();
      const className = scroll.getAttribute("class") ?? "";
      expect(className).toMatch(/pb-\[calc\(/);
    });
  });

  it("toggles open when feedzero:toggle-sidebar event is dispatched", async () => {
    const { container } = renderDrawer();
    const doc = container.ownerDocument;

    // Starts collapsed — chevron points up (no rotate-180)
    const chevronBefore = doc.querySelector("[data-testid='drawer-open-chevron']");
    expect(chevronBefore?.getAttribute("class")).not.toContain("rotate-180");

    // Dispatch the toggle event
    doc.dispatchEvent(new CustomEvent("feedzero:toggle-sidebar"));

    // Drawer should now be open — chevron rotates 180°
    await waitFor(() => {
      const chevron = doc.querySelector("[data-testid='drawer-open-chevron']");
      expect(chevron?.getAttribute("class")).toContain("rotate-180");
    });
  });
});
