/**
 * Collapsing the desktop feed list.
 *
 * The `[` shortcut and the shadcn sidebar state existed, but the desktop
 * sidebar is a ResizablePanel wrapping <AppSidebar collapsible="none">,
 * so toggling `open` moved nothing: the panel kept its width and the feed
 * list stayed on screen. These tests pin the two halves of the fix —
 * a visible toggle, and a sidebar that actually leaves the a11y tree and
 * the tab order when collapsed.
 *
 * Real pixel collapse is a browser concern (happy-dom has no layout);
 * `tests/e2e/sidebar-collapse.spec.ts` covers the width.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { AppLayout } from "@/pages/app-layout.tsx";
import { FeedsRoute } from "@/pages/feeds-route.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateArticle: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getSmartFilters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getPreferences: vi.fn().mockResolvedValue({ ok: true, value: null }),
  putPreferences: vi.fn().mockResolvedValue({ ok: true, value: true }),
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

vi.mock("@/hooks/use-media-query.ts", () => ({
  useIsDesktop: () => true,
}));

vi.mock("@/hooks/use-keyboard-nav.ts", () => ({
  useKeyboardNav: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/feeds/f1"]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/feeds/:feedId" element={<FeedsRoute />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const feed = {
  id: "f1",
  url: "https://example.com/feed",
  title: "Test Feed",
  description: "",
  siteUrl: "https://example.com",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe("desktop sidebar collapse", () => {
  beforeEach(() => {
    document.cookie = "sidebar_state=; path=/; max-age=0";
    useFeedStore.setState({
      feeds: [feed],
      folders: [],
      selectedFeedId: "f1",
      isLoading: false,
      error: null,
      isRefreshingAll: false,
      refreshingFeedIds: new Set(),
      feedsLoaded: false,
    });
    useArticleStore.setState({
      articles: [],
      selectedArticle: null,
      isLoading: false,
    });
  });

  it("starts expanded, with the sidebar in the a11y tree", () => {
    renderPage();
    expect(screen.getByTestId("sidebar-panel")).not.toHaveAttribute("hidden");
  });

  it("offers a visible toggle reflecting the expanded state", () => {
    renderPage();
    expect(
      screen.getByRole("button", { name: /feed list/i }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("clicking the toggle collapses the sidebar out of the tab order", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /feed list/i }));

    // `hidden` (not just zero width) matters: a 0px panel with
    // overflow-hidden still holds focusable feed links, so tabbing would
    // walk through a sidebar the user cannot see.
    expect(screen.getByTestId("sidebar-panel")).toHaveAttribute("hidden");
    expect(
      screen.getByRole("button", { name: /feed list/i }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("clicking the toggle again brings the sidebar back", async () => {
    const user = userEvent.setup();
    renderPage();
    const toggle = () =>
      screen.getByRole("button", { name: /feed list/i });

    await user.click(toggle());
    await user.click(toggle());

    expect(screen.getByTestId("sidebar-panel")).not.toHaveAttribute("hidden");
  });

  it("the [ shortcut drives the same collapse as the button", () => {
    renderPage();

    act(() => {
      document.dispatchEvent(new CustomEvent("feedzero:toggle-sidebar"));
    });

    expect(screen.getByTestId("sidebar-panel")).toHaveAttribute("hidden");
  });

  it("restores the collapsed state on the next load", () => {
    document.cookie = "sidebar_state=false; path=/";
    renderPage();
    // Collapsing is a deliberate choice about the shape of the app, not a
    // per-session accident — it would not be much of an option if every
    // reload undid it.
    expect(screen.getByTestId("sidebar-panel")).toHaveAttribute("hidden");
  });
});
