import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { FeedsPage } from "@/pages/feeds-page.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

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
  needsExtraction: vi.fn(() => false),
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
    // Both panels use native overflow-y-auto scroll containers.
    // ArticleList needs a native scroller for the virtualizer to measure.
    // The reader panel also uses native overflow to avoid Radix ScrollArea's
    // display:table wrapper, which prevents text from wrapping at panel width.
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

  it("reader panel uses native overflow scroll (not Radix ScrollArea)", () => {
    // Radix ScrollArea wraps content in display:table which prevents text from
    // wrapping to the panel width — text clips at the panel edge instead.
    // The reader panel must use a plain overflow-y-auto div.
    const { container } = renderPage();
    const panels = container.querySelectorAll("[data-panel]");
    const readerPanel = panels[2]; // sidebar=0, article-list=1, reader=2
    expect(readerPanel.querySelector("[data-radix-scroll-area-viewport]")).toBeNull();
    const nativeScroller = readerPanel.querySelector(".overflow-y-auto") ??
      readerPanel.querySelector(".overflow-auto");
    expect(nativeScroller).not.toBeNull();
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

  it("each ResizablePanel has a stable id so the layout library can persist sizes across re-renders", () => {
    // Without stable ids, react-resizable-panels falls back to useId() and
    // generates fresh keys on every mount/route change — which breaks
    // persistence and causes a visible re-balance when the panel count
    // changes (e.g. switching to /explore drops the reader panel).
    const { container } = renderPage();
    const panels = container.querySelectorAll("[data-panel]");
    expect(panels).toHaveLength(3);
    const ids = Array.from(panels).map((p) => p.getAttribute("id"));
    expect(ids).toEqual(
      expect.arrayContaining(["sidebar", "article-list", "reader"]),
    );
    // No id should be auto-generated (react useId values start with ":r")
    for (const id of ids) {
      expect(id).not.toMatch(/^:/);
    }
  });

  it("uses the 3-panel layout id on the feeds route so widths persist independently of the explore layout", () => {
    // The Group must carry a stable id matching the layout shape; switching
    // to /explore (which drops the reader) must use a different id so widths
    // for each layout are remembered separately.
    const { container } = renderPage("/feeds/f1");
    const group = container.querySelector("[data-slot='resizable-panel-group']");
    expect(group).not.toBeNull();
    expect(group!.getAttribute("id")).toBe("feedzero:layout:feeds");
  });

  it("uses the single-content layout id on the explore route", () => {
    const { container } = renderPage("/explore");
    const group = container.querySelector("[data-slot='resizable-panel-group']");
    expect(group).not.toBeNull();
    expect(group!.getAttribute("id")).toBe("feedzero:layout:single");
  });

  it("explore layout exposes stable ids for sidebar and explore panels", () => {
    const { container } = renderPage("/explore");
    const panels = container.querySelectorAll("[data-panel]");
    expect(panels).toHaveLength(2);
    const ids = Array.from(panels).map((p) => p.getAttribute("id"));
    expect(ids).toEqual(expect.arrayContaining(["sidebar", "explore"]));
  });

  it("does not clobber selectedArticle to the previous URL article when articles mutates faster than React Router (PR #34 follow-up)", async () => {
    // Repro: user is on /feeds/f1/articles/a0. They scroll down so a0 is
    // off-screen, then click a15. Inside the click chain, ArticleList's
    // handleSelect calls store.selectArticle(a15) — that updates the
    // selectedArticle in Zustand AND triggers the auto-mark-as-read flush
    // for the previously-selected article, which mutates the articles array.
    // navigate('/articles/a15') is also called, but React Router's articleId
    // (from useParams) doesn't always settle in the same render pass as
    // Zustand updates — there's a window where `articles` has changed but
    // `articleId` is still 'a0' (stale).
    //
    // The line-136 effect in feeds-page.tsx re-runs whenever `articles`
    // changes. If it doesn't track which articleId it last synced from, it
    // sees `selectedArticle.id === 'a15' !== articleId === 'a0'` and
    // "fixes" the mismatch by selecting articles[0] — clobbering the
    // user's just-clicked selection. Then articleId settles, the effect
    // runs again, and selection bounces back to a15. The visible result
    // is two scroll jumps and a flash of the wrong article.
    const articles = Array.from({ length: 50 }, (_, i) => ({
      id: `a${i}`,
      feedId: "f1",
      guid: `a${i}`,
      title: `Article ${i}`,
      link: `https://example.com/${i}`,
      content: "",
      summary: "",
      author: "",
      publishedAt: Date.now() - i * 1000,
      read: false,
      createdAt: Date.now(),
    }));
    useArticleStore.setState({
      articles,
      selectedArticle: articles[0],
      isLoading: false,
    });

    renderPage("/feeds/f1/articles/a0");
    // Let the initial sync settle so the effect records 'a0' as the
    // last-synced articleId.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Simulate the post-click state: selectedArticle has just been switched
    // to a15 by ArticleList's handleSelect, AND the articles array has been
    // mutated by the auto-mark-as-read flush — but the URL articleId is
    // still 'a0' because the navigate hasn't propagated through React
    // Router yet.
    await act(async () => {
      useArticleStore.setState({
        selectedArticle: articles[15],
        articles: articles.map((a, i) =>
          i === 15 ? { ...a, read: true } : a,
        ),
      });
    });

    // selectedArticle MUST still be a15. The line-136 effect must not
    // re-sync from the stale articleId 'a0' and clobber the click result.
    expect(useArticleStore.getState().selectedArticle?.id).toBe("a15");
  });

  it("explore layout's sidebar starts at the user's stored width (preserved across layout transitions)", async () => {
    // The sidebar width must be respected when entering the Explore tab.
    // Distinct group ids per layout shape mean the library's per-group
    // persistence does not share the sidebar size between the 3-panel feeds
    // layout and the 2-panel explore/stats layout. The page reads the shared
    // sidebar width from localStorage and applies it as the panel's
    // defaultSize so /explore opens at the user's preferred width.
    const hookModule = await import("@/hooks/use-shared-sidebar-size.ts");
    const spy = vi.spyOn(hookModule, "useSharedSidebarSize");

    const SIDEBAR_KEY = hookModule.SIDEBAR_SIZE_STORAGE_KEY;
    window.localStorage.setItem(SIDEBAR_KEY, "27");

    renderPage("/explore");

    // The hook must be called with the active layout id so the persisted
    // sidebar width re-applies after the layout transitions to /explore.
    expect(spy).toHaveBeenCalled();
    const lastCallLayoutKey = spy.mock.calls.at(-1)?.[0];
    expect(lastCallLayoutKey).toBe("feedzero:layout:single");

    // The hook returned a defaultSize derived from localStorage; that value
    // must be the one the page hands to the sidebar panel.
    const lastResult = spy.mock.results.at(-1)?.value;
    expect(lastResult).toBeDefined();
    expect(lastResult.defaultSize).toBe("27%");

    window.localStorage.removeItem(SIDEBAR_KEY);
    spy.mockRestore();
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

  it("mobile reader snap panel delegates to ReaderPanel (no overflow-y-auto on the wrapper)", () => {
    // ReaderPanel now owns its own scroll container and nav bar. The outer snap
    // panel is a geometry wrapper only — it must not double-scroll.
    useFeedStore.setState({ feeds: [defaultFeed], selectedFeedId: "f1" });
    const { container } = renderPage("/feeds/f1");
    const reader = container.querySelector('[data-testid="reader-scroll-mobile"]');
    expect(reader).not.toBeNull();
    expect((reader as HTMLElement).className).not.toContain("overflow-y-auto");
  });
});
