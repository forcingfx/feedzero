import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { FeedsPage } from "@/pages/feeds-page.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateArticle: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));

vi.mock("@/core/extractor/extractor.ts", () => ({
  extract: vi.fn(),
}));

let mockIsDesktop = true;
vi.mock("@/hooks/use-media-query.ts", () => ({
  useIsDesktop: () => mockIsDesktop,
}));

vi.mock("@/hooks/use-keyboard-nav.ts", () => ({
  useKeyboardNav: vi.fn(),
}));

function renderPage(route = "/feeds") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/feeds" element={<FeedsPage />} />
        <Route path="/feeds/:feedId" element={<FeedsPage />} />
        <Route
          path="/feeds/:feedId/articles/:articleId"
          element={<FeedsPage />}
        />
        <Route path="/explore" element={<FeedsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const defaultFeed = {
  id: "f1",
  url: "https://example.com/feed",
  title: "Test Feed",
  description: "",
  siteUrl: "https://example.com",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe("FeedsPage layout — desktop", () => {
  beforeEach(() => {
    mockIsDesktop = true;
    useFeedStore.setState({
      feeds: [defaultFeed],
      selectedFeedId: null,
      isLoading: false,
      error: null,
      isRefreshingAll: false,
      refreshingFeedIds: new Set(),
    });
    useArticleStore.setState({
      articles: [],
      selectedArticle: null,
      isLoading: false,
    });
  });

  it("shows only 2 panels (sidebar + explore) when there are no feeds", () => {
    // When no feeds exist, the layout shows sidebar + explore, not sidebar +
    // article list + reader. The panel group is still present for resizability.
    useFeedStore.setState({ feeds: [] });
    const { container } = renderPage();
    const panels = container.querySelectorAll("[data-panel]");
    expect(panels).toHaveLength(2);
  });

  it("shows panels when feeds exist", () => {
    const { container } = renderPage();
    const panelGroup = container.querySelector(
      "[data-slot='resizable-panel-group']",
    );
    expect(panelGroup).not.toBeNull();
  });

  it("SidebarProvider wrapper has h-svh and overflow-hidden", () => {
    const { container } = renderPage();
    const wrapper = container.querySelector("[data-slot='sidebar-wrapper']");
    expect(wrapper).not.toBeNull();
    expect(wrapper!.className).toContain("h-svh");
    expect(wrapper!.className).toContain("overflow-hidden");
  });

  it("desktop view has no SidebarInset (sidebar is a ResizablePanel)", () => {
    // The desktop layout uses a ResizablePanelGroup so the sidebar is inline,
    // not wrapped in SidebarInset. SidebarInset is only used in the mobile path.
    const { container } = renderPage();
    const inset = container.querySelector("[data-slot='sidebar-inset']");
    expect(inset).toBeNull();
  });

  it("desktop view has no top header bar", () => {
    // Desktop has no <header> bar above the content — the sidebar provides
    // navigation context inline. The mobile path renders a sticky <header>.
    const { container } = renderPage();
    const headers = container.querySelectorAll("header");
    expect(headers).toHaveLength(0);
  });

  it("ResizablePanelGroup spans full viewport height (h-svh)", () => {
    // The panel group fills the full viewport — no flex shrink needed since
    // SidebarProvider itself is h-svh.
    const { container } = renderPage();
    const panelGroup = container.querySelector(
      "[data-slot='resizable-panel-group']",
    );
    expect(panelGroup).not.toBeNull();
    expect(panelGroup!.className).toContain("h-svh");
  });

  it("each ResizablePanel has overflow-hidden via className", () => {
    const { container } = renderPage();
    // The library renders data-panel on the outer div with inline overflow:hidden.
    // Our className prop goes to an inner child div. We assert the inner div
    // (data-slot="resizable-panel") carries overflow-hidden.
    const panelSlots = container.querySelectorAll(
      "[data-slot='resizable-panel']",
    );
    expect(panelSlots).toHaveLength(3);
    for (const slot of panelSlots) {
      // The className is on the inner div (child of data-panel)
      const inner = slot.querySelector("div");
      expect(inner).not.toBeNull();
      expect(inner!.className).toContain("overflow-hidden");
    }
  });

  it("each panel has its own scrollable region", () => {
    // The reader panel uses a Radix ScrollArea. The article list panel owns
    // its own overflow-y-auto scroll container (needed so the virtualizer in
    // ArticleList has a single, measurable scroll element — nesting a Radix
    // ScrollArea around it would hide the real scroller behind a viewport
    // div, breaking virtualization).
    const { container } = renderPage();
    const panels = container.querySelectorAll("[data-panel]");
    for (const panel of panels) {
      const scrollArea = panel.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      const nativeScroller =
        panel.querySelector(".overflow-y-auto") ??
        panel.querySelector(".overflow-auto");
      expect(scrollArea ?? nativeScroller).not.toBeNull();
    }
  });

  it("renders ResizableHandle between panels", () => {
    const { container } = renderPage();
    const handle = container.querySelector("[data-slot='resizable-handle']");
    expect(handle).not.toBeNull();
  });

  it("renders 3 ResizablePanels on desktop (sidebar + article list + reader)", () => {
    // All three columns must be independently resizable. Two handles required:
    // sidebar|article-list and article-list|reader.
    const { container } = renderPage();
    const panels = container.querySelectorAll("[data-panel]");
    expect(panels).toHaveLength(3);
    const handles = container.querySelectorAll("[data-slot='resizable-handle']");
    expect(handles).toHaveLength(2);
  });

  it("sidebar CSS variable is at most 14rem so three panels fit at 1024px", () => {
    // At 1024px: sidebar (≤14rem = 224px) + article list (≥180px) + reader (≥200px)
    // = 224 + 180 + 200 = 604px — well within 1024px. If the sidebar grows beyond
    // 14rem, the remaining space gets too tight at common laptop widths.
    const { container } = renderPage();
    const wrapper = container.querySelector("[data-slot='sidebar-wrapper']");
    expect(wrapper).not.toBeNull();
    const style = (wrapper as HTMLElement).getAttribute("style") ?? "";
    // Extract the --sidebar-width value from the inline style
    const match = style.match(/--sidebar-width:\s*([^;]+)/);
    expect(match).not.toBeNull();
    const remValue = parseFloat(match![1]);
    expect(remValue).toBeLessThanOrEqual(14);
  });
});

describe("FeedsPage layout — mobile", () => {
  beforeEach(() => {
    mockIsDesktop = false;
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
      selectedArticle: null,
      isLoading: false,
    });
  });

  it("does not render ResizablePanelGroup", () => {
    const { container } = renderPage();
    const panelGroup = container.querySelector(
      "[data-slot='resizable-panel-group']",
    );
    expect(panelGroup).toBeNull();
  });

  it("main element has role main", () => {
    const { container } = renderPage();
    const main = container.querySelector("[role='main']");
    expect(main).not.toBeNull();
  });

  it("main has flex-1 and overflow-y-auto on the explore route", () => {
    // Explore is the only mobile layout where <main> is the sole scrollable
    // container. The default /feeds path now redirects to /feeds/all and
    // renders the scroll-snap list/reader pair instead of a single main.
    const { container } = renderPage("/explore");
    const main = container.querySelector("[role='main']");
    expect(main).not.toBeNull();
    expect(main!.className).toContain("flex-1");
    expect(main!.className).toContain("overflow-y-auto");
  });

  it("does not show Back button on article list or feeds root", () => {
    for (const path of ["/feeds/f1", "/feeds"]) {
      const { container } = renderPage(path);
      const buttons = Array.from(container.querySelectorAll("button"));
      const backBtn = buttons.find((b) => b.textContent?.includes("←"));
      expect(backBtn).toBeUndefined();
    }
  });
});
