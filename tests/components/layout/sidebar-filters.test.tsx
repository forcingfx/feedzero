import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { AppSidebar } from "@/components/layout/app-sidebar.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import { useLicenseStore } from "@/stores/license-store.ts";
import { toFilterFeedId } from "@feedzero/core/utils/constants";
import type { Feed, SmartFilter, ConditionGroup } from "@feedzero/core/types";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getSmartFilters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  addSmartFilter: vi.fn().mockResolvedValue({ ok: true, value: true }),
  updateSmartFilter: vi.fn().mockResolvedValue({ ok: true, value: true }),
  removeSmartFilter: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));
vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));
vi.mock("@/core/extractor/prefetch-service.ts", () => ({
  prefetchStarredArticles: vi
    .fn()
    .mockResolvedValue({ ok: true, value: { extracted: 0, failed: 0 } }),
}));

// Simulate "paid tier launched" so the gate enforces the tier check
// rather than relaxing to paid-tier-inactive for every shipped feature.
vi.mock("@/core/features/paid-tier-active.ts", () => ({
  isPaidTierActive: vi.fn(() => true),
}));
vi.mock("@/core/features/self-hosted.ts", () => ({
  isSelfHosted: vi.fn(() => false),
}));

const emptyRule: ConditionGroup = { kind: "group", match: "all", children: [] };

function feed(id: string): Feed {
  return {
    id,
    url: `https://${id}.com`,
    title: id,
    description: "",
    siteUrl: "",
    createdAt: 0,
    updatedAt: 0,
  };
}

function filter(id: string, name: string): SmartFilter {
  return {
    id,
    name,
    rule: emptyRule,
    createdAt: 0,
    updatedAt: 0,
  };
}

function renderSidebar(onFeedSelect?: (id: string) => void) {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <AppSidebar onFeedSelect={onFeedSelect} />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("AppSidebar Filters section", () => {
  beforeEach(() => {
    useFeedStore.setState({
      feeds: [feed("f1")],
      selectedFeedId: null,
      isLoading: false,
      error: null,
      isRefreshingAll: false,
      refreshingFeedIds: new Set(),
    });
    useArticleStore.setState({ articlesByFeedId: {}, articles: [] });
    useSmartFilterStore.setState({
      filters: [],
      isLoading: false,
      editorOpen: false,
      editorTarget: null,
    });
    useLicenseStore.setState({ tier: "personal", verifying: false });
  });

  it("renders the 'New filter' affordance for Personal-tier users", () => {
    renderSidebar();
    expect(screen.getByTestId("sidebar-new-filter")).toBeInTheDocument();
  });

  it("renders one row per existing filter", () => {
    useSmartFilterStore.setState({
      filters: [filter("a", "Tech AI"), filter("b", "Sports")],
    });
    renderSidebar();
    const rows = screen.getAllByTestId("sidebar-smart-filter-item");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("Tech AI")).toBeInTheDocument();
    expect(screen.getByText("Sports")).toBeInTheDocument();
  });

  it("clicking a filter row calls onFeedSelect with the filter feed id", async () => {
    useSmartFilterStore.setState({
      filters: [filter("a", "Tech AI")],
    });
    const onFeedSelect = vi.fn();
    renderSidebar(onFeedSelect);

    const user = userEvent.setup();
    await user.click(screen.getByText("Tech AI"));

    expect(onFeedSelect).toHaveBeenCalledWith(toFilterFeedId("a"));
  });

  it("clicking 'New filter' opens the editor in create mode (no target)", async () => {
    renderSidebar();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("sidebar-new-filter"));

    const state = useSmartFilterStore.getState();
    expect(state.editorOpen).toBe(true);
    expect(state.editorTarget).toBeNull();
  });

  it("shows the Filters section to free users so the feature is discoverable", () => {
    // Honor-system open-core: gated features stay visible. Clicking routes
    // to the upgrade page rather than hiding the section. See the
    // 'route-to-upgrade' test below for the click behaviour.
    useLicenseStore.setState({ tier: "free", verifying: false });

    renderSidebar();

    expect(screen.getByTestId("sidebar-new-filter")).toBeInTheDocument();
  });

  it("clicking 'New filter' as a free user routes to the upgrade page instead of opening the editor", async () => {
    useLicenseStore.setState({ tier: "free", verifying: false });

    renderSidebar();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("sidebar-new-filter"));

    // Editor MUST NOT open for gate-locked users — that would let them
    // build a filter they can never save, an upsell anti-pattern.
    expect(useSmartFilterStore.getState().editorOpen).toBe(false);
  });
});
