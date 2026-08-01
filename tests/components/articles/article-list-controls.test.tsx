/**
 * ArticleListControls is the desktop title bar at the top of the
 * article-list panel. Shows the current feed indicator on the left
 * and the cog + sort pills on the right. Hidden on mobile — the
 * global header in app-layout carries the breadcrumb + pills there.
 *
 * MobileHeaderPills is the bare pills-only wrapper mounted in the
 * mobile global header.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import {
  ArticleListControls,
  MobileHeaderPills,
} from "@/components/articles/article-list-controls.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import {
  ALL_FEEDS_ID,
  STARRED_FEED_ID,
  toFolderFeedId,
  toFilterFeedId,
} from "@feedzero/core/utils/constants";
import type { Feed, Folder, SmartFilter } from "@feedzero/core/types";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  updateFeed: vi.fn(),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateFolder: vi.fn(),
  removeFolder: vi.fn(),
  removeFeed: vi.fn(),
  addFolder: vi.fn(),
  getSmartFilters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn().mockResolvedValue(undefined),
  reloadFeed: vi.fn(),
}));

const { useIsMobileSpy } = vi.hoisted(() => ({
  useIsMobileSpy: vi.fn(() => false),
}));

vi.mock("@/hooks/use-mobile.ts", () => ({
  useIsMobile: () => useIsMobileSpy(),
}));

function feed(id: string, title: string): Feed {
  return {
    id,
    url: `https://${id}.example.com/feed.xml`,
    title,
    description: "",
    siteUrl: `https://${id}.example.com`,
    createdAt: 0,
    updatedAt: 0,
  };
}

function folder(id: string, name: string): Folder {
  return { id, name, createdAt: 0 };
}

function smartFilter(id: string, name: string): SmartFilter {
  return {
    id,
    name,
    rule: { kind: "group", match: "all", children: [] },
    createdAt: 0,
    updatedAt: 0,
  };
}

function renderControls() {
  return render(
    <MemoryRouter>
      <ArticleListControls sortMode="newest" onSortChange={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("ArticleListControls (desktop title bar)", () => {
  beforeEach(() => {
    useIsMobileSpy.mockReturnValue(false);
    useFeedStore.setState({
      feeds: [feed("f-tech", "Tech Crunchies")],
      folders: [folder("folder-tech", "Tech")],
      selectedFeedId: null,
    });
    useSmartFilterStore.setState({
      filters: [smartFilter("filter-recent", "Recent")],
    });
    useArticleStore.setState({ articleSortMode: "newest" });
  });

  it("renders on desktop with both pills", () => {
    useFeedStore.setState({ selectedFeedId: "f-tech" });
    renderControls();
    expect(screen.getByTestId("article-list-controls")).toBeInTheDocument();
    expect(screen.getByTestId("settings-pill")).toBeInTheDocument();
    expect(screen.getByLabelText(/sort/i)).toBeInTheDocument();
  });

  it("hides entirely on mobile (returns null)", () => {
    useIsMobileSpy.mockReturnValue(true);
    useFeedStore.setState({ selectedFeedId: "f-tech" });
    renderControls();
    expect(screen.queryByTestId("article-list-controls")).toBeNull();
  });

  it("shows the feed title on a single feed view", () => {
    useFeedStore.setState({ selectedFeedId: "f-tech" });
    renderControls();
    expect(screen.getByText("Tech Crunchies")).toBeInTheDocument();
  });

  it("shows 'All items' on ALL_FEEDS view", () => {
    useFeedStore.setState({ selectedFeedId: ALL_FEEDS_ID });
    renderControls();
    expect(screen.getByText(/All items/i)).toBeInTheDocument();
  });

  it("shows 'Starred' on STARRED view", () => {
    useFeedStore.setState({ selectedFeedId: STARRED_FEED_ID });
    renderControls();
    expect(screen.getByText(/Starred/i)).toBeInTheDocument();
  });

  it("shows the folder name on a folder view", () => {
    useFeedStore.setState({ selectedFeedId: toFolderFeedId("folder-tech") });
    renderControls();
    expect(screen.getByText("Tech")).toBeInTheDocument();
  });

  it("shows the smart filter name on a filter view", () => {
    useFeedStore.setState({ selectedFeedId: toFilterFeedId("filter-recent") });
    renderControls();
    expect(screen.getByText("Recent")).toBeInTheDocument();
  });

  it("settings pill hides on ALL_FEEDS but sort pill stays (no settings on aggregated)", () => {
    useFeedStore.setState({ selectedFeedId: ALL_FEEDS_ID });
    renderControls();
    expect(screen.queryByTestId("settings-pill")).toBeNull();
    expect(screen.getByLabelText(/sort/i)).toBeInTheDocument();
  });
});

describe("MobileHeaderPills", () => {
  beforeEach(() => {
    useFeedStore.setState({
      feeds: [feed("f-tech", "Tech Crunchies")],
      folders: [],
      selectedFeedId: "f-tech",
      isRefreshingAll: false,
    });
    useSmartFilterStore.setState({ filters: [] });
    useArticleStore.setState({ articleSortMode: "newest" });
  });

  it("renders one consolidated view-options pill — no refresh, no separate cog/sort", () => {
    // Three same-looking pills of three different scopes (refresh action,
    // feed settings, list sort) read as inconsistent (user feedback on
    // PR #237). Refresh is the pull-to-refresh gesture's job on mobile;
    // sort + contextual settings consolidate into one menu.
    render(
      <MemoryRouter>
        <MobileHeaderPills />
      </MemoryRouter>,
    );
    const wrapper = screen.getByTestId("mobile-header-pills");
    expect(wrapper.className).not.toMatch(/sticky/);
    expect(screen.getByTestId("view-options-pill")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-refresh")).toBeNull();
    expect(screen.queryByTestId("settings-pill")).toBeNull();
  });

  it("menu offers the sort modes; selecting one updates the store", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MobileHeaderPills />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId("view-options-pill"));
    await user.click(await screen.findByText(/oldest first/i));

    expect(useArticleStore.getState().articleSortMode).toBe("oldest");
  });

  it("menu offers Feed settings on a feed view and opens the dialog", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MobileHeaderPills />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId("view-options-pill"));
    await user.click(await screen.findByText(/feed settings/i));

    expect(useFeedStore.getState().feedSettingsDialogId).toBe("f-tech");
  });

  it("omits the settings item on aggregated views (nothing to configure)", async () => {
    useFeedStore.setState({ selectedFeedId: ALL_FEEDS_ID });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MobileHeaderPills />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId("view-options-pill"));

    expect(await screen.findByText(/newest first/i)).toBeInTheDocument();
    expect(screen.queryByText(/feed settings/i)).toBeNull();
  });
});
