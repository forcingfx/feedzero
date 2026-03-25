import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AppSidebar } from "@/components/layout/app-sidebar.tsx";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";

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

const FEED_WITH_ITEMS = {
  feeds: [
    {
      id: "feed-1",
      url: "https://example.com/rss",
      title: "Example Feed",
      description: "",
      siteUrl: "https://example.com",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],
  selectedFeedId: null,
  isLoading: false,
  error: null,
  isRefreshingAll: false,
  refreshingFeedIds: new Set<string>(),
};

let originalInnerWidth: number;

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches:
      query.includes("max-width") &&
      parseInt(query.match(/\d+/)?.[0] ?? "0") >= width,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

/** Helper that opens the mobile sidebar sheet after mount. */
function SidebarOpener() {
  const { setOpenMobile } = useSidebar();
  // Open the sheet on mount via a button the test can click
  return (
    <button data-testid="open-sidebar" onClick={() => setOpenMobile(true)}>
      Open
    </button>
  );
}

describe("AppSidebar tooltip on mobile", () => {
  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    useFeedStore.setState(FEED_WITH_ITEMS);
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it("refresh tooltip is hidden on mobile", async () => {
    setViewportWidth(400);
    render(
      <MemoryRouter>
        <SidebarProvider>
          <SidebarOpener />
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>,
    );

    // Open the mobile sidebar sheet
    const opener = screen.getByTestId("open-sidebar");
    await act(async () => {
      opener.click();
    });

    // Now the sidebar content should be visible inside the Sheet
    const refreshButton = screen.getByRole("button", { name: /refresh/i });

    // Focus the trigger to open the tooltip
    await act(async () => {
      refreshButton.focus();
    });

    // Look for tooltip content in the entire document (portaled)
    const allTooltipContents = document.querySelectorAll(
      "[data-slot='tooltip-content']",
    );
    const refreshTooltip = Array.from(allTooltipContents).find((el) =>
      el.textContent?.includes("Refresh"),
    );

    // On mobile, the refresh tooltip should be hidden
    if (refreshTooltip) {
      expect(refreshTooltip.hasAttribute("hidden")).toBe(true);
    } else {
      // If Radix didn't mount tooltip content, verify no tooltip text visible
      // outside the sr-only span
      const allRefreshText = screen.getAllByText(/Refresh/);
      expect(allRefreshText).toHaveLength(1);
      expect(allRefreshText[0].classList.contains("sr-only")).toBe(true);
    }
  });
});
