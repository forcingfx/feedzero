import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { SignalPage } from "@/pages/signal-page.tsx";
import { useSignalStore, SIGNAL_REPORT_CACHE_KEY } from "@/stores/signal-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useLicenseStore } from "@/stores/license-store.ts";
import { isSelfHosted } from "@/core/features/self-hosted.ts";
import { isPaidTierActive } from "@/core/features/paid-tier-active.ts";
import { SIGNAL_CORPUS_GATE, SIGNAL_REPORT_SCHEMA_VERSION } from "@/core/signal/types.ts";
import type { Article, Feed } from "@/types/index.ts";

vi.mock("@/core/features/self-hosted.ts", () => ({ isSelfHosted: vi.fn(() => false) }));
vi.mock("@/core/features/paid-tier-active.ts", () => ({ isPaidTierActive: vi.fn(() => false) }));

const NOW = new Date("2026-05-21T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

// 12 distinct OpenAI headlines — each becomes its own story (low mutual
// title overlap), so the cluster has many stories to page through.
const OPENAI_HEADLINES = [
  "OpenAI ships a release",
  "OpenAI hires a team",
  "OpenAI cuts prices",
  "OpenAI faces a lawsuit",
  "OpenAI updates safety policy",
  "OpenAI hosts a developer event",
  "OpenAI buys a startup",
  "OpenAI rolls back a feature",
  "OpenAI funds a grant",
  "OpenAI beats revenue forecast",
  "OpenAI expands cloud capacity",
  "OpenAI opens an office",
];

function makeFeed(id: string, title?: string): Feed {
  return {
    id,
    url: `https://example.com/${id}.xml`,
    title: title ?? `Feed ${id}`,
    description: "",
    siteUrl: `https://example.com/${id}`,
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW - DAY,
  };
}

function makeArticle(id: string, feedId: string, title: string, ageDays: number): Article {
  const publishedAt = NOW - ageDays * DAY;
  return {
    id,
    feedId,
    guid: id,
    title,
    link: `https://example.com/${id}`,
    content: "",
    summary: "",
    author: "",
    publishedAt,
    read: false,
    createdAt: publishedAt,
  };
}

/**
 * A corpus with one OpenAI topic: 12 distinct stories, one of them
 * syndicated verbatim across three outlets, plus entity-free noise so the
 * total clears the gate.
 */
function seedReadyCorpus() {
  const feeds: Feed[] = Array.from({ length: 4 }, (_, i) => makeFeed(`f${i + 1}`, `Outlet ${i + 1}`));
  const articlesByFeedId: Record<string, Article[]> = { f1: [], f2: [], f3: [], f4: [] };
  let id = 0;
  OPENAI_HEADLINES.forEach((title, i) => {
    const feedId = `f${(i % 4) + 1}`;
    articlesByFeedId[feedId].push(makeArticle(`o-${id++}`, feedId, title, i % 4));
  });
  // Same story across three outlets → a multi-outlet story.
  ["f1", "f2", "f3"].forEach((feedId) => {
    articlesByFeedId[feedId].push(makeArticle(`s-${id++}`, feedId, "OpenAI launches atlas browser", 1));
  });
  // Entity-free noise (all lowercase, no proper nouns).
  for (let i = 0; i < 95; i++) {
    const feedId = `f${(i % 4) + 1}`;
    articlesByFeedId[feedId].push(makeArticle(`n-${id++}`, feedId, `memo${i} note${i} item${i}`, i % 4));
  }
  useFeedStore.setState({ feeds });
  useArticleStore.setState({ articlesByFeedId });
}

function mockViewport(isDesktop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: isDesktop && query.includes("1024"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

function renderAt(path = "/signal") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/signal" element={<><SignalPage /><LocationProbe /></>} />
        <Route path="/feeds/:feedId/articles/:articleId" element={<div>READER</div>} />
        <Route path="/settings" element={<LocationProbe />} />
        <Route path="/explore" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SignalPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    mockViewport(false); // mobile by default
    useSignalStore.setState({ status: "idle", report: null, corpusSize: 0, error: null });
    useFeedStore.setState({ feeds: [] });
    useArticleStore.setState({ articlesByFeedId: {} });
    useLicenseStore.setState({ tier: "free", verifying: false });
    vi.mocked(isSelfHosted).mockReturnValue(false);
    vi.mocked(isPaidTierActive).mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the locked splash with a forward-looking remaining count + three CTAs", async () => {
    const feeds = [makeFeed("f1")];
    const articlesByFeedId: Record<string, Article[]> = { f1: [] };
    for (let i = 0; i < 47; i++) {
      articlesByFeedId.f1.push(makeArticle(`a-${i}`, "f1", `t ${i}`, i % 5));
    }
    useFeedStore.setState({ feeds });
    useArticleStore.setState({ articlesByFeedId });

    renderAt();
    await waitFor(() => expect(useSignalStore.getState().status).toBe("locked"));
    expect(screen.getByText(/53/)).toBeInTheDocument();
    expect(screen.getByText(/more articles to unlock/i)).toBeInTheDocument();
    expect(screen.getByText(/47 of 100 articles in your store/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add feeds/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Browse the catalog/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Import OPML/i })).toBeInTheDocument();
  });

  it("renders the empty-but-unlocked message with an Add feeds recovery action", async () => {
    const feeds = [makeFeed("solo")];
    const articlesByFeedId: Record<string, Article[]> = { solo: [] };
    for (let i = 0; i < SIGNAL_CORPUS_GATE + 5; i++) {
      articlesByFeedId.solo.push(makeArticle(`a-${i}`, "solo", `unique title ${i}`, i % 5));
    }
    useFeedStore.setState({ feeds });
    useArticleStore.setState({ articlesByFeedId });

    renderAt();
    await waitFor(() => expect(useSignalStore.getState().status).toBe("ready"));
    expect(screen.getByText(/no clear signal/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add more feeds/i })).toBeInTheDocument();
  });

  it("renders an entity topic heading, story rows, and the window label", async () => {
    seedReadyCorpus();
    renderAt();
    await waitFor(() => expect(useSignalStore.getState().status).toBe("ready"));

    expect(screen.getByRole("heading", { level: 2, name: "OpenAI" })).toBeInTheDocument();
    expect(screen.getByText("OpenAI ships a release")).toBeInTheDocument();
    expect(screen.getByText(/articles\s*·\s*\d+\s*outlets/i)).toBeInTheDocument();
    expect(screen.getByText(/last 7 days/i)).toBeInTheDocument();
  });

  it("badges a story covered by multiple outlets and expands to list them", async () => {
    seedReadyCorpus();
    renderAt();
    await waitFor(() => expect(useSignalStore.getState().status).toBe("ready"));

    expect(screen.getByText(/covered by 3 outlets/i)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /show all 3 outlets/i }));
    // Each outlet's name appears in the expanded list.
    expect(screen.getByText("Outlet 1")).toBeInTheDocument();
    expect(screen.getByText("Outlet 2")).toBeInTheDocument();
    expect(screen.getByText("Outlet 3")).toBeInTheDocument();
  });

  it("on desktop, clicking a story opens the reader directly", async () => {
    mockViewport(true);
    seedReadyCorpus();
    renderAt();
    await waitFor(() => expect(useSignalStore.getState().status).toBe("ready"));

    const user = userEvent.setup();
    await user.click(screen.getByText("OpenAI ships a release"));
    await waitFor(() => expect(screen.getByText("READER")).toBeInTheDocument());
  });

  it("on mobile, tapping a story opens a preview then 'Open in reader' navigates", async () => {
    mockViewport(false);
    seedReadyCorpus();
    renderAt();
    await waitFor(() => expect(useSignalStore.getState().status).toBe("ready"));

    const user = userEvent.setup();
    await user.click(screen.getByText("OpenAI ships a release"));
    const open = await screen.findByRole("button", { name: /open in reader/i });
    await user.click(open);
    await waitFor(() => expect(screen.getByText("READER")).toBeInTheDocument());
  });

  it("Refresh button bypasses the cache", async () => {
    seedReadyCorpus();
    renderAt();
    await waitFor(() => expect(useSignalStore.getState().status).toBe("ready"));
    const first = useSignalStore.getState().report?.generatedAt;

    vi.setSystemTime(NOW + 60 * 60 * 1000);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(useSignalStore.getState().report?.generatedAt).not.toBe(first));
  });

  it("reveals additional stories when '+ N more' is clicked", async () => {
    seedReadyCorpus();
    renderAt();
    await waitFor(() => expect(useSignalStore.getState().status).toBe("ready"));

    // Default shows the first 6 story heads (each headline starts "OpenAI ...").
    const headRegex = /OpenAI\s+\S/;
    expect(screen.getAllByText(headRegex).length).toBe(6);
    const moreButton = screen.getByRole("button", { name: /\+ \d+ more/i });
    const user = userEvent.setup();
    await user.click(moreButton);
    // 12 distinct + 1 syndicated = 13 stories in the cluster.
    expect(screen.getAllByText(headRegex).length).toBe(13);
  });

  it("loads from localStorage on mount without recomputing when the cache is fresh", async () => {
    seedReadyCorpus();
    localStorage.setItem(
      SIGNAL_REPORT_CACHE_KEY,
      JSON.stringify({
        report: {
          schemaVersion: SIGNAL_REPORT_SCHEMA_VERSION,
          topics: [
            {
              term: "primed",
              displayTerm: "Primed",
              stories: [],
              totalStories: 0,
              totalArticlesInCluster: 0,
              feedCount: 2,
            },
          ],
          window: "7d",
          corpusSize: useArticleStore.getState().articlesByFeedId
            ? Object.values(useArticleStore.getState().articlesByFeedId).reduce((n, l) => n + l.length, 0)
            : 0,
          corpusInWindow: SIGNAL_CORPUS_GATE,
          feedsInWindow: 4,
          generatedAt: NOW - 60 * 1000,
        },
      }),
    );

    renderAt();
    await waitFor(() => expect(useSignalStore.getState().status).toBe("ready"));
    expect(useSignalStore.getState().report?.topics[0]?.term).toBe("primed");
  });

  it("discards a cached report written by an incompatible schema version", async () => {
    seedReadyCorpus();
    localStorage.setItem(
      SIGNAL_REPORT_CACHE_KEY,
      JSON.stringify({
        report: {
          schemaVersion: SIGNAL_REPORT_SCHEMA_VERSION - 1,
          topics: [{ term: "stale", displayTerm: "Stale", stories: [], totalStories: 0, totalArticlesInCluster: 0, feedCount: 2 }],
          window: "7d",
          corpusSize: 120,
          corpusInWindow: 120,
          feedsInWindow: 4,
          generatedAt: NOW - 60 * 1000,
        },
      }),
    );

    renderAt();
    await waitFor(() => expect(useSignalStore.getState().status).toBe("ready"));
    // The stale topic must NOT be served; a fresh report replaces it.
    expect(useSignalStore.getState().report?.topics[0]?.term).not.toBe("stale");
  });

  describe("tier gating", () => {
    it("shows the upgrade prompt for a Free user once the paid tier is live", async () => {
      vi.mocked(isPaidTierActive).mockReturnValue(true);
      useLicenseStore.setState({ tier: "free" });
      seedReadyCorpus();

      renderAt();
      await waitFor(() => expect(screen.getByText(/Unlock Signal/i)).toBeInTheDocument());
      expect(screen.getByRole("button", { name: /Upgrade to Personal/i })).toBeInTheDocument();
      expect(screen.queryByText("OpenAI ships a release")).not.toBeInTheDocument();
    });

    it("does NOT gate a Personal user — the report renders", async () => {
      vi.mocked(isPaidTierActive).mockReturnValue(true);
      useLicenseStore.setState({ tier: "personal" });
      seedReadyCorpus();

      renderAt();
      await waitFor(() => expect(useSignalStore.getState().status).toBe("ready"));
      expect(screen.queryByText(/Unlock Signal/i)).not.toBeInTheDocument();
    });

    it("does NOT gate a self-hosted Free user", async () => {
      vi.mocked(isPaidTierActive).mockReturnValue(true);
      vi.mocked(isSelfHosted).mockReturnValue(true);
      useLicenseStore.setState({ tier: "free" });
      seedReadyCorpus();

      renderAt();
      await waitFor(() => expect(useSignalStore.getState().status).toBe("ready"));
      expect(screen.queryByText(/Unlock Signal/i)).not.toBeInTheDocument();
    });

    it("Upgrade button routes to the subscription settings tab", async () => {
      vi.mocked(isPaidTierActive).mockReturnValue(true);
      useLicenseStore.setState({ tier: "free" });
      seedReadyCorpus();

      renderAt();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /Upgrade to Personal/i })).toBeInTheDocument(),
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Upgrade to Personal/i }));
      await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/settings"));
      expect(screen.getByTestId("location")).toHaveTextContent("tab=subscription");
    });
  });
});
