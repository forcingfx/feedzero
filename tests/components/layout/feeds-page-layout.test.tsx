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
        <Route path="/stats" element={<FeedsPage />} />
        <Route path="/settings" element={<FeedsPage />} />
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

  it("shows only 2 top-level panels (sidebar + stage) when there are no feeds", () => {
    // When no feeds exist, the empty-state Explore renders *inside* the stage
    // panel. The outer panel group always exposes exactly two children:
    // sidebar and stage. Whatever the route shows lives inside the stage.
    useFeedStore.setState({ feeds: [] });
    const { container } = renderPage();
    const outerGroup = container.querySelector(
      "[data-slot='resizable-panel-group']",
    );
    expect(outerGroup).not.toBeNull();
    const topLevelPanels = outerGroup!.querySelectorAll(
      ":scope > [data-panel]",
    );
    expect(topLevelPanels).toHaveLength(2);
    const ids = Array.from(topLevelPanels).map((p) => p.getAttribute("id"));
    expect(ids).toEqual(["sidebar", "stage"]);
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
    // Two-tier model: outer group has [sidebar, stage] (2 panels). On the
    // default route, the stage contains an inner group with [article-list,
    // reader] (2 more panels). All four ResizablePanels carry overflow-hidden
    // so neither layer accidentally introduces a scrollbar at the panel edge.
    const panelSlots = container.querySelectorAll(
      "[data-slot='resizable-panel']",
    );
    expect(panelSlots).toHaveLength(4);
    for (const slot of panelSlots) {
      // The className is on the inner div (child of data-panel)
      const inner = slot.querySelector("div");
      expect(inner).not.toBeNull();
      expect(inner!.className).toContain("overflow-hidden");
    }
  });

  it("each leaf panel has its own scrollable region", () => {
    // Sidebar, article-list, and reader are the *leaf* panels that hold
    // scrollable content. The `stage` panel is a relay — its scrollable
    // children live inside the inner group (or inside a single feature
    // component on /explore /stats). We assert the three leaves carry
    // scrollers; double-counting `stage` would falsely require it to scroll.
    const { container } = renderPage();
    const leafIds = ["sidebar", "article-list", "reader"];
    for (const id of leafIds) {
      const panel = container.querySelector(`[data-panel][id="${id}"]`);
      expect(panel, `leaf panel ${id} not found`).not.toBeNull();
      const scrollArea = panel!.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      const nativeScroller =
        panel!.querySelector(".overflow-y-auto") ??
        panel!.querySelector(".overflow-auto");
      expect(scrollArea ?? nativeScroller).not.toBeNull();
    }
  });

  it("reader panel uses native overflow scroll (not Radix ScrollArea)", () => {
    // Radix ScrollArea wraps content in display:table which prevents text from
    // wrapping to the panel width — text clips at the panel edge instead.
    // The reader panel must use a plain overflow-y-auto div.
    // The reader now lives in the inner group inside `stage`; find it by id
    // rather than by index, since the outer group also contains panels.
    const { container } = renderPage();
    const readerPanel = container.querySelector('[data-panel][id="reader"]');
    expect(readerPanel).not.toBeNull();
    expect(
      readerPanel!.querySelector("[data-radix-scroll-area-viewport]"),
    ).toBeNull();
    const nativeScroller =
      readerPanel!.querySelector(".overflow-y-auto") ??
      readerPanel!.querySelector(".overflow-auto");
    expect(nativeScroller).not.toBeNull();
  });

  it("renders ResizableHandle between panels", () => {
    const { container } = renderPage();
    const handle = container.querySelector("[data-slot='resizable-handle']");
    expect(handle).not.toBeNull();
  });

  it("renders 2 outer + 2 inner ResizablePanels on the default desktop route", () => {
    // Two-tier model. Outer group: [sidebar | stage]. Stage on the default
    // route holds an inner group: [article-list | reader]. Total 4 panels,
    // 2 handles (one per group). Each tier is independently resizable.
    const { container } = renderPage();
    const panels = container.querySelectorAll("[data-panel]");
    expect(panels).toHaveLength(4);
    const handles = container.querySelectorAll("[data-slot='resizable-handle']");
    expect(handles).toHaveLength(2);
  });

  it("each ResizablePanel has a stable id so the layout library can persist sizes across re-renders", () => {
    // Without stable ids, react-resizable-panels falls back to useId() and
    // generates fresh keys on every mount/route change — which breaks
    // persistence and re-balances proportions on remount.
    const { container } = renderPage();
    const panels = container.querySelectorAll("[data-panel]");
    expect(panels).toHaveLength(4);
    const ids = Array.from(panels).map((p) => p.getAttribute("id"));
    expect(ids).toEqual(
      expect.arrayContaining(["sidebar", "stage", "article-list", "reader"]),
    );
    // No id should be auto-generated (react useId values start with ":r")
    for (const id of ids) {
      expect(id).not.toMatch(/^:/);
    }
  });

  it("STRUCTURAL INVARIANT: top-level panels are [sidebar, stage] on every desktop route", () => {
    // The sidebar's neighbors must never change across routes. This is the
    // structural counterpart of the user-facing rule "the sidebar size only
    // changes when you drag the handle or resize the window."
    //
    // react-resizable-panels recomputes layout when a group's child set
    // changes — even when individual panel ids stay stable. The fix is not
    // to remember harder, but to never present a different child set in the
    // first place. The stage is a constant slot whose *content* swaps.
    for (const route of ["/feeds/f1", "/explore", "/stats", "/settings"]) {
      const { container, unmount } = renderPage(route);
      const outerGroup = container.querySelector(
        "[data-slot='resizable-panel-group']",
      );
      expect(outerGroup, `outer group missing on ${route}`).not.toBeNull();
      const topLevelPanels = outerGroup!.querySelectorAll(
        ":scope > [data-panel]",
      );
      const ids = Array.from(topLevelPanels).map((p) => p.getAttribute("id"));
      expect(ids, `top-level ids on ${route}`).toEqual(["sidebar", "stage"]);
      unmount();
    }
  });

  it("inner group exists ONLY on the default route (article list + reader)", () => {
    // Explore, Stats, and Settings render a single feature inside the
    // stage with no inner ResizablePanelGroup. The default route adds a
    // second group for the list/reader split. This keeps the topology of
    // the *outer* group constant while letting list/reader stay
    // independently resizable.
    const { container: cDefault } = renderPage("/feeds/f1");
    expect(
      cDefault.querySelectorAll("[data-slot='resizable-panel-group']"),
    ).toHaveLength(2);

    const { container: cExplore } = renderPage("/explore");
    expect(
      cExplore.querySelectorAll("[data-slot='resizable-panel-group']"),
    ).toHaveLength(1);

    const { container: cStats } = renderPage("/stats");
    expect(
      cStats.querySelectorAll("[data-slot='resizable-panel-group']"),
    ).toHaveLength(1);

    const { container: cSettings } = renderPage("/settings");
    expect(
      cSettings.querySelectorAll("[data-slot='resizable-panel-group']"),
    ).toHaveLength(1);
  });

  it("uses a STABLE layout id across all routes so the sidebar width survives navigation", () => {
    // PR F: the prior model used distinct ids per layout shape
    // (feedzero:layout:feeds for /feeds, feedzero:layout:single for /explore).
    // That meant react-resizable-panels stored panel sizes separately per
    // route group — so clicking Explore reset the sidebar to the single
    // layout's defaults, visibly changing the sidebar width on every
    // navigation. The sidebar width must be route-independent.
    const { container: c1 } = renderPage("/feeds/f1");
    const g1 = c1.querySelector("[data-slot='resizable-panel-group']");
    const id1 = g1!.getAttribute("id");
    const { container: c2 } = renderPage("/explore");
    const g2 = c2.querySelector("[data-slot='resizable-panel-group']");
    const id2 = g2!.getAttribute("id");
    expect(id1).toBe(id2);
    expect(id1).toBe("feedzero:layout:main");
  });

  it("explore route renders [sidebar, stage] at the top level with explore inside the stage", () => {
    // Explore is a feature area mounted *inside* the stage panel, not a
    // sibling of sidebar. Total panel count is 2 (no inner group).
    const { container } = renderPage("/explore");
    const panels = container.querySelectorAll("[data-panel]");
    expect(panels).toHaveLength(2);
    const ids = Array.from(panels).map((p) => p.getAttribute("id"));
    expect(ids).toEqual(["sidebar", "stage"]);
    const stage = container.querySelector('[data-panel][id="stage"]');
    expect(stage).not.toBeNull();
    // ExploreCatalog content lives inside the stage.
    expect(stage!.textContent ?? "").not.toBe("");
  });

  it("settings route renders [sidebar, stage] at the top level with settings inside the stage", () => {
    // Settings shares the [sidebar | stage] shell with Stats and Explore.
    // Per PR I's structural invariant, the top-level panels are ALWAYS
    // [sidebar, stage] on every desktop route — the settings UI lives
    // INSIDE the stage panel, not as a sibling of sidebar.
    const { container } = renderPage("/settings");
    const panels = container.querySelectorAll("[data-panel]");
    expect(panels).toHaveLength(2);
    const ids = Array.from(panels).map((p) => p.getAttribute("id"));
    expect(ids).toEqual(["sidebar", "stage"]);
    const stage = container.querySelector('[data-panel][id="stage"]');
    expect(stage).not.toBeNull();
    // SettingsPage content lives inside the stage.
    expect(stage!.textContent ?? "").not.toBe("");
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

  it("explore layout's sidebar starts at the user's stored width in pixels (preserved by single stable layout id)", async () => {
    // PR F: with one stable layout id across routes, the sidebar width is
    // naturally preserved by react-resizable-panels' per-id persistence.
    // PR J: the hook now stores pixels (not percentages) so the width
    // survives viewport changes between drag and reload. The defaultSize
    // returned by the hook is a px-suffixed string.
    const hookModule = await import("@/hooks/use-shared-sidebar-size.ts");
    const spy = vi.spyOn(hookModule, "useSharedSidebarSize");

    const SIDEBAR_KEY = hookModule.SIDEBAR_WIDTH_STORAGE_KEY;
    window.localStorage.setItem(SIDEBAR_KEY, "240");

    renderPage("/explore");

    expect(spy).toHaveBeenCalled();
    const lastCallLayoutKey = spy.mock.calls.at(-1)?.[0];
    expect(lastCallLayoutKey).toBe("feedzero:layout:main");

    const lastResult = spy.mock.results.at(-1)?.value;
    expect(lastResult).toBeDefined();
    expect(lastResult.defaultSize).toBe("240px");

    window.localStorage.removeItem(SIDEBAR_KEY);
    spy.mockRestore();
  });

  it("sidebar CSS variable is at most 18rem so three panels still fit at 1024px", () => {
    // At 1024px: sidebar (≤18rem = 288px) + article list (≥180px) + reader (≥200px)
    // = 288 + 180 + 200 = 668px — still fits within 1024px with 356px of slack.
    // Widened from 14rem → 18rem to give feed titles more breathing room
    // without crowding the reader at common laptop widths. Going beyond 18rem
    // would leave the reader too narrow for comfortable reading.
    const { container } = renderPage();
    const wrapper = container.querySelector("[data-slot='sidebar-wrapper']");
    expect(wrapper).not.toBeNull();
    const style = (wrapper as HTMLElement).getAttribute("style") ?? "";
    const match = style.match(/--sidebar-width:\s*([^;]+)/);
    expect(match).not.toBeNull();
    const remValue = parseFloat(match![1]);
    expect(remValue).toBeLessThanOrEqual(18);
  });

  it("sidebar default width is 18rem (the new user-facing default after PR A widening)", () => {
    // Pin the default so a regression downgrades it visibly. The previous
    // default of 14rem made feed titles wrap aggressively at common counts.
    const { container } = renderPage();
    const wrapper = container.querySelector("[data-slot='sidebar-wrapper']");
    const style = (wrapper as HTMLElement).getAttribute("style") ?? "";
    expect(style).toMatch(/--sidebar-width:\s*18rem/);
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
