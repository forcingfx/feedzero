import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { FeedsPage } from "@/pages/feeds-page.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
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

  it("does not show panels when there are no feeds", () => {
    useFeedStore.setState({ feeds: [] });
    const { container } = renderPage();
    const panelGroup = container.querySelector(
      "[data-slot='resizable-panel-group']",
    );
    expect(panelGroup).toBeNull();
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

  it("SidebarInset has overflow-hidden", () => {
    const { container } = renderPage();
    const inset = container.querySelector("[data-slot='sidebar-inset']");
    expect(inset).not.toBeNull();
    expect(inset!.className).toContain("overflow-hidden");
  });

  it("header has shrink-0", () => {
    const { container } = renderPage();
    const inset = container.querySelector("[data-slot='sidebar-inset']");
    const header = inset?.querySelector("header");
    expect(header).not.toBeNull();
    expect(header!.className).toContain("shrink-0");
  });

  it("ResizablePanelGroup has flex-1 and min-h-0", () => {
    const { container } = renderPage();
    // The library renders data-group on the outer element; our wrapper adds
    // data-slot="resizable-panel-group" and the className to it.
    const panelGroup = container.querySelector(
      "[data-slot='resizable-panel-group']",
    );
    expect(panelGroup).not.toBeNull();
    expect(panelGroup!.className).toContain("flex-1");
    expect(panelGroup!.className).toContain("min-h-0");
  });

  it("each ResizablePanel has overflow-hidden via className", () => {
    const { container } = renderPage();
    // The library renders data-panel on the outer div with inline overflow:hidden.
    // Our className prop goes to an inner child div. We assert the inner div
    // (data-slot="resizable-panel") carries overflow-hidden.
    const panelSlots = container.querySelectorAll(
      "[data-slot='resizable-panel']",
    );
    expect(panelSlots).toHaveLength(2);
    for (const slot of panelSlots) {
      // The className is on the inner div (child of data-panel)
      const inner = slot.querySelector("div");
      expect(inner).not.toBeNull();
      expect(inner!.className).toContain("overflow-hidden");
    }
  });

  it("each panel wraps a ScrollArea with h-full", () => {
    const { container } = renderPage();
    const panels = container.querySelectorAll("[data-panel]");
    for (const panel of panels) {
      const scrollArea = panel.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      expect(scrollArea).not.toBeNull();
    }
  });

  it("renders exactly 2 ResizablePanel components", () => {
    const { container } = renderPage();
    const panels = container.querySelectorAll("[data-panel]");
    expect(panels).toHaveLength(2);
  });

  it("renders ResizableHandle between panels", () => {
    const { container } = renderPage();
    const handle = container.querySelector("[data-slot='resizable-handle']");
    expect(handle).not.toBeNull();
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

  it("main has flex-1, flex, flex-col, and min-h-0", () => {
    const { container } = renderPage();
    const main = container.querySelector("[role='main']");
    expect(main).not.toBeNull();
    expect(main!.className).toContain("flex-1");
    expect(main!.className).toContain("flex");
    expect(main!.className).toContain("flex-col");
    expect(main!.className).toContain("min-h-0");
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
