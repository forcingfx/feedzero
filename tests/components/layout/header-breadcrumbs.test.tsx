import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { HeaderBreadcrumbs } from "@/components/layout/header-breadcrumbs.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
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

const FEED = {
  id: "feed-1",
  url: "https://example.com/feed.xml",
  title: "Example Feed",
  description: "",
  siteUrl: "https://example.com",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const ARTICLE = {
  id: "art-1",
  feedId: "feed-1",
  guid: "guid-1",
  title: "Test Article Title",
  link: "https://example.com/article-1",
  content: "<p>Content</p>",
  summary: "",
  author: "Author",
  read: false,
  publishedAt: Date.now(),
  createdAt: Date.now(),
};

function renderBreadcrumbs() {
  return render(
    <MemoryRouter>
      <HeaderBreadcrumbs />
    </MemoryRouter>,
  );
}

describe("HeaderBreadcrumbs", () => {
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
      selectedArticle: null,
      isLoading: false,
    });
  });

  it("returns null when no feed is selected and no fallback", () => {
    const { container } = renderBreadcrumbs();
    expect(container.querySelector("nav")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("shows fallback text when no feed is selected", () => {
    const { container } = render(
      <MemoryRouter>
        <HeaderBreadcrumbs fallback="Feeds" />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe("Feeds");
    expect(container.querySelector("nav")).toBeNull();
  });

  it("shows feed title when a feed is selected", () => {
    useFeedStore.setState({ feeds: [FEED], selectedFeedId: "feed-1" });
    renderBreadcrumbs();
    expect(screen.getByText("Example Feed")).toBeInTheDocument();
  });

  it("shows feed favicon when a feed is selected", () => {
    useFeedStore.setState({ feeds: [FEED], selectedFeedId: "feed-1" });
    const { container } = renderBreadcrumbs();
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe(
      "/api/icon?domain=example.com",
    );
  });

  it("shows feed and article when both are selected", () => {
    useFeedStore.setState({ feeds: [FEED], selectedFeedId: "feed-1" });
    useArticleStore.setState({ selectedArticle: ARTICLE });
    renderBreadcrumbs();
    expect(screen.getByText("Example Feed")).toBeInTheDocument();
    expect(screen.getByText("Test Article Title")).toBeInTheDocument();
  });

  it("renders a separator between feed and article", () => {
    useFeedStore.setState({ feeds: [FEED], selectedFeedId: "feed-1" });
    useArticleStore.setState({ selectedArticle: ARTICLE });
    const { container } = renderBreadcrumbs();
    const separators = container.querySelectorAll(
      "[data-slot='breadcrumb-separator']",
    );
    expect(separators.length).toBeGreaterThan(0);
  });

  it("feed title has truncate class", () => {
    useFeedStore.setState({ feeds: [FEED], selectedFeedId: "feed-1" });
    renderBreadcrumbs();
    // Truncate is on the span inside the link, not the link itself
    const feedTitle = screen.getByText("Example Feed");
    expect(feedTitle.className).toContain("truncate");
  });

  it("feed breadcrumb is clickable", async () => {
    useFeedStore.setState({ feeds: [FEED], selectedFeedId: "feed-1" });
    useArticleStore.setState({ selectedArticle: ARTICLE });
    renderBreadcrumbs();
    const feedLink = screen.getByText("Example Feed");
    expect(feedLink.closest("a, [role='link'], button")).not.toBeNull();
  });

  describe("onTriggerClick prop", () => {
    it("calls onTriggerClick when the feed breadcrumb is clicked", async () => {
      const user = userEvent.setup();
      const onTriggerClick = vi.fn();
      useFeedStore.setState({ feeds: [FEED], selectedFeedId: "feed-1" });
      render(<MemoryRouter><HeaderBreadcrumbs onTriggerClick={onTriggerClick} /></MemoryRouter>);
      await user.click(screen.getByText("Example Feed").closest("[data-slot='breadcrumb-link']")!);
      expect(onTriggerClick).toHaveBeenCalledOnce();
    });

    it("calls onTriggerClick when the fallback text is clicked", async () => {
      const user = userEvent.setup();
      const onTriggerClick = vi.fn();
      render(<MemoryRouter><HeaderBreadcrumbs fallback="Articles" onTriggerClick={onTriggerClick} /></MemoryRouter>);
      await user.click(screen.getByText("Articles"));
      expect(onTriggerClick).toHaveBeenCalledOnce();
    });

    it("shows a ChevronDown affordance icon when onTriggerClick is provided", () => {
      useFeedStore.setState({ feeds: [FEED], selectedFeedId: "feed-1" });
      const { container } = render(<MemoryRouter><HeaderBreadcrumbs onTriggerClick={vi.fn()} /></MemoryRouter>);
      expect(container.querySelector("[data-testid='feed-switcher-chevron']")).not.toBeNull();
    });

    it("does not show a ChevronDown icon when onTriggerClick is absent", () => {
      useFeedStore.setState({ feeds: [FEED], selectedFeedId: "feed-1" });
      const { container } = render(<MemoryRouter><HeaderBreadcrumbs /></MemoryRouter>);
      expect(container.querySelector("[data-testid='feed-switcher-chevron']")).toBeNull();
    });
  });
});
