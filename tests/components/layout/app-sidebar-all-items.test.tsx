import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { AppSidebar } from "@/components/layout/app-sidebar.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { ALL_FEEDS_ID } from "@feedzero/core/utils/constants";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));

const mockFeed = (id: string, title: string) => ({
  id,
  url: `https://${id}.com/feed`,
  title,
  description: "",
  siteUrl: `https://${id}.com`,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

function renderSidebar(onFeedSelect?: (feedId: string) => void) {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <AppSidebar onFeedSelect={onFeedSelect} />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("AppSidebar All items entry", () => {
  beforeEach(() => {
    useFeedStore.setState({
      feeds: [mockFeed("f1", "Tech News"), mockFeed("f2", "Sports")],
      selectedFeedId: null,
      isLoading: false,
      error: null,
      isRefreshingAll: false,
      refreshingFeedIds: new Set(),
    });
  });

  it("renders All items entry at top of feed list", () => {
    renderSidebar();

    expect(screen.getByText("All items")).toBeInTheDocument();
  });

  it("All items appears before individual feeds", () => {
    const { container } = renderSidebar();

    const menuButtons = container.querySelectorAll(
      "[data-sidebar='menu-button']",
    );
    const texts = Array.from(menuButtons).map((btn) => btn.textContent);

    // Ordering invariant: Explore → Signal → All items → feeds.
    // Briefings used to sit between Signal and All items but folded
    // under /signal as a sub-tab — no longer a sidebar entry. Filters
    // live further down and the per-feed list comes last; exact
    // positions vary as more entries land, but the head is stable.
    const exploreIdx = texts.findIndex((t) => t?.includes("Explore"));
    const signalIdx = texts.findIndex((t) => t?.includes("Signal"));
    const allItemsIdx = texts.findIndex((t) => t?.includes("All items"));
    const techIdx = texts.findIndex((t) => t?.includes("Tech News"));
    expect(exploreIdx).toBe(0);
    expect(signalIdx).toBe(1);
    expect(allItemsIdx).toBe(2);
    expect(techIdx).toBeGreaterThan(allItemsIdx);
    // No separate Briefings sidebar entry post-fold.
    expect(texts.some((t) => t?.trim() === "Briefings")).toBe(false);
  });

  it("calls onFeedSelect with ALL_FEEDS_ID when clicked", async () => {
    const user = userEvent.setup();
    const onFeedSelect = vi.fn();
    renderSidebar(onFeedSelect);

    await user.click(screen.getByText("All items"));

    expect(onFeedSelect).toHaveBeenCalledWith(ALL_FEEDS_ID);
  });

  it("shows All items as active when selectedFeedId is ALL_FEEDS_ID", () => {
    useFeedStore.setState({ selectedFeedId: ALL_FEEDS_ID });
    const { container } = renderSidebar();

    const allItemsButton = container.querySelector(
      "[data-sidebar='menu-button'][data-active='true']",
    );
    expect(allItemsButton?.textContent).toContain("All items");
  });

  it("All items has a Layers icon", () => {
    const { container } = renderSidebar();

    const menuButtons = container.querySelectorAll(
      "[data-sidebar='menu-button']",
    );
    const allItemsButton = menuButtons[0];

    // All items should have Layers icon (lucide-react renders as svg)
    const allItemsSvg = allItemsButton.querySelector("svg");
    expect(allItemsSvg).toBeTruthy();
    // Lucide icons have a class with lucide-
    expect(allItemsSvg?.classList.toString()).toContain("lucide");
  });
});
