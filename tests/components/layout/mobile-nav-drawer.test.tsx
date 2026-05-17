import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    // SidebarProvider's default is `flex min-h-svh w-full` (row layout) — must be overridden
    // inside the drawer so settings + feed-list stack vertically instead of side by side.
    expect(sidebarWrapper!.className).not.toContain("flex ");
    expect(sidebarWrapper!.className).not.toMatch(/\bflex$/);
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

  it("drawer body content has horizontal padding so feed/settings rows don't run edge-to-edge", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Test Feed")] });
    const { container } = renderDrawer();
    await user.click(screen.getByRole("button", { name: "Open feed list" }));

    const scroll = await waitFor(() => {
      const s = container.ownerDocument.querySelector("[data-testid='drawer-scroll']");
      if (!s) throw new Error("scroll not mounted");
      return s;
    });
    // Both the feed nav body and the settings list must sit inside a wrapper
    // with horizontal padding so the rows don't touch the screen edges.
    const paddedSections = scroll.querySelectorAll("[data-testid='drawer-section']");
    expect(paddedSections.length).toBeGreaterThanOrEqual(2);
    for (const section of paddedSections) {
      expect(section.className).toMatch(/\bpx-\d/);
    }
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
      await userEvent.click(screen.getByTestId("drawer-handle-strip"));
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
    const chevronBefore = doc.querySelector("[data-testid='drawer-handle-strip'] svg:last-child");
    expect(chevronBefore?.getAttribute("class")).not.toContain("rotate-180");

    // Dispatch the toggle event
    doc.dispatchEvent(new CustomEvent("feedzero:toggle-sidebar"));

    // Drawer should now be open — chevron rotates 180°
    await waitFor(() => {
      const chevron = doc.querySelector("[data-testid='drawer-handle-strip'] svg:last-child");
      expect(chevron?.getAttribute("class")).toContain("rotate-180");
    });
  });
});
