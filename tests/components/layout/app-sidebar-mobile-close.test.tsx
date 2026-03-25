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

/** Captures the mobile sidebar open state. */
let capturedOpenMobile: boolean | undefined;

function SidebarStateCapture() {
  const { openMobile, setOpenMobile } = useSidebar();
  capturedOpenMobile = openMobile;
  return (
    <button data-testid="open-sidebar" onClick={() => setOpenMobile(true)}>
      Open
    </button>
  );
}

describe("AppSidebar closes on mobile feed select", () => {
  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    capturedOpenMobile = undefined;
    useFeedStore.setState(FEED_WITH_ITEMS);
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it("closes the mobile sidebar when a feed is selected", async () => {
    setViewportWidth(400);
    const onFeedSelect = vi.fn();

    render(
      <MemoryRouter>
        <SidebarProvider>
          <SidebarStateCapture />
          <AppSidebar onFeedSelect={onFeedSelect} />
        </SidebarProvider>
      </MemoryRouter>,
    );

    // Open the mobile sidebar
    const opener = screen.getByTestId("open-sidebar");
    await act(async () => {
      opener.click();
    });

    expect(capturedOpenMobile).toBe(true);

    // Click a feed in the sidebar
    const feedButton = screen.getByRole("button", { name: /example feed/i });
    await act(async () => {
      feedButton.click();
    });

    // The sidebar should close
    expect(capturedOpenMobile).toBe(false);
    // The onFeedSelect callback should still be called
    expect(onFeedSelect).toHaveBeenCalledWith("feed-1");
  });
});
