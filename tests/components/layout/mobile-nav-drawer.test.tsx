import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateArticle: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
  updateFeed: vi.fn(),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));

const makeFeed = (id: string, title: string) => ({
  id,
  url: `https://example.com/${id}`,
  title,
  description: "",
  siteUrl: "https://example.com",
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

function renderDrawer(props: Partial<{ onFeedSelect: (id: string) => void }> = {}) {
  return render(
    <MemoryRouter>
      <MobileNavDrawer onFeedSelect={props.onFeedSelect ?? vi.fn()} />
    </MemoryRouter>,
  );
}

describe("MobileNavDrawer", () => {
  beforeEach(() => {
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
      articlesByFeedId: {},
      selectedArticle: null,
      isLoading: false,
    });
  });

  it("renders a handle strip that is always present in the DOM", () => {
    const { container } = renderDrawer();
    expect(container.ownerDocument.querySelector("[data-testid='drawer-handle-strip']")).not.toBeNull();
  });

  it("renders 'All items' entry when drawer is open", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole("button", { name: "Open feed list" }));
    expect(await screen.findByText("All items")).toBeInTheDocument();
  });

  it("calls onFeedSelect with ALL_FEEDS_ID when All items is tapped", async () => {
    const user = userEvent.setup();
    const onFeedSelect = vi.fn();
    renderDrawer({ onFeedSelect });
    await user.click(screen.getByRole("button", { name: "Open feed list" }));
    await user.click(await screen.findByText("All items"));
    expect(onFeedSelect).toHaveBeenCalledWith("all");
  });

  it("renders feed names from the store when drawer is open", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Hacker News"), makeFeed("f2", "The Verge")] });
    renderDrawer();
    await user.click(screen.getByRole("button", { name: "Open feed list" }));
    expect(await screen.findByText("Hacker News")).toBeInTheDocument();
    expect(screen.getByText("The Verge")).toBeInTheDocument();
  });

  it("calls onFeedSelect with the correct feedId when a feed is tapped", async () => {
    const user = userEvent.setup();
    const onFeedSelect = vi.fn();
    useFeedStore.setState({ feeds: [makeFeed("f1", "Hacker News")] });
    renderDrawer({ onFeedSelect });
    await user.click(screen.getByRole("button", { name: "Open feed list" }));
    await user.click(await screen.findByText("Hacker News"));
    expect(onFeedSelect).toHaveBeenCalledWith("f1");
  });

  it("toggles open when feedzero:toggle-sidebar event is dispatched", async () => {
    const { container } = renderDrawer();
    const doc = container.ownerDocument;

    // Starts collapsed — chevron points up (no rotate-180)
    const chevronBefore = doc.querySelector("[data-testid='drawer-handle-strip'] svg:last-child");
    expect(chevronBefore?.getAttribute("class")).not.toContain("rotate-180");

    // Dispatch the toggle event
    doc.dispatchEvent(new CustomEvent("feedzero:toggle-sidebar"));

    // Drawer should now be open — chevron rotates 180°
    await waitFor(() => {
      const chevron = doc.querySelector("[data-testid='drawer-handle-strip'] svg:last-child");
      expect(chevron?.getAttribute("class")).toContain("rotate-180");
    });
  });
});
