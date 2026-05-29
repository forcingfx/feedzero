/**
 * The sidebar Signal entry shows a spinning indicator while either the
 * local (ML) Signal store or the AI Signal store is generating a
 * report. This is the "I navigated away mid-refresh — is it still
 * running?" affordance: without it, the user has no way to know that a
 * refresh kicked from /signal is still in flight after they leave the
 * page.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AppSidebar } from "@/components/layout/app-sidebar.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import { useLicenseStore } from "@/stores/license-store.ts";
import { useSignalStore } from "@/stores/signal-store.ts";
import { useAISignalStore } from "@/stores/ai-signal-store.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getSmartFilters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  addSmartFilter: vi.fn(),
  updateSmartFilter: vi.fn(),
  removeSmartFilter: vi.fn(),
}));
vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));
vi.mock("@/core/features/paid-tier-active.ts", () => ({
  isPaidTierActive: vi.fn(() => true),
}));
vi.mock("@/core/features/self-hosted.ts", () => ({
  isSelfHosted: vi.fn(() => false),
}));

function renderSidebar() {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <AppSidebar onFeedSelect={() => {}} />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("Sidebar Signal entry — in-flight indicator", () => {
  beforeEach(() => {
    useFeedStore.setState({
      feeds: [],
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
    useSignalStore.setState({ status: "idle", report: null, corpusSize: 0, error: null });
    useAISignalStore.setState({
      status: "idle",
      report: null,
      corpusSize: 0,
      error: null,
      loadingStartedAt: null,
    });
  });

  it("renders no in-flight indicator at rest", () => {
    renderSidebar();
    expect(screen.queryByTestId("sidebar-signal-inflight")).toBeNull();
  });

  it("renders the in-flight indicator when the ML signal store is loading", () => {
    renderSidebar();
    act(() => {
      useSignalStore.setState({ status: "loading" });
    });
    expect(screen.getByTestId("sidebar-signal-inflight")).toBeInTheDocument();
  });

  it("renders the in-flight indicator when the AI signal store is loading", () => {
    renderSidebar();
    act(() => {
      useAISignalStore.setState({ status: "loading", loadingStartedAt: Date.now() });
    });
    expect(screen.getByTestId("sidebar-signal-inflight")).toBeInTheDocument();
  });

  it("clears the indicator when the store returns to ready", () => {
    renderSidebar();
    act(() => {
      useSignalStore.setState({ status: "loading" });
    });
    expect(screen.getByTestId("sidebar-signal-inflight")).toBeInTheDocument();
    act(() => {
      useSignalStore.setState({ status: "ready" });
    });
    expect(screen.queryByTestId("sidebar-signal-inflight")).toBeNull();
  });
});
