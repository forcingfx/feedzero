import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { SignalPage } from "@/pages/signal-page.tsx";
import { useSignalStore, SIGNAL_REPORT_CACHE_KEY } from "@/stores/signal-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { SIGNAL_CORPUS_GATE } from "@/core/signal/types.ts";
import type { Article, Feed } from "@/types/index.ts";

const NOW = new Date("2026-05-21T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

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

function renderAt(path = "/signal") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/signal" element={<SignalPage />} />
        <Route path="/feeds/:feedId/articles/:articleId" element={<div>READER</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SignalPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    useSignalStore.setState({
      status: "idle",
      report: null,
      corpusSize: 0,
      error: null,
    });
    useFeedStore.setState({ feeds: [] });
    useArticleStore.setState({ articlesByFeedId: {} });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the locked tile with progress when corpus < 100 articles", async () => {
    const feeds = [makeFeed("f1")];
    const articlesByFeedId: Record<string, Article[]> = { f1: [] };
    for (let i = 0; i < 47; i++) {
      articlesByFeedId.f1.push(makeArticle(`a-${i}`, "f1", `t ${i}`, i % 5));
    }
    useFeedStore.setState({ feeds });
    useArticleStore.setState({ articlesByFeedId });

    renderAt();
    await waitFor(() => expect(useSignalStore.getState().status).toBe("locked"));
    expect(screen.getByText("47 / 100")).toBeInTheDocument();
    expect(screen.getByText(/Signal needs noise/i)).toBeInTheDocument();
  });

  it("renders the empty-but-unlocked message when the corpus has no cross-feed signal", async () => {
    const feeds = [makeFeed("solo")];
    const articlesByFeedId: Record<string, Article[]> = { solo: [] };
    for (let i = 0; i < SIGNAL_CORPUS_GATE + 5; i++) {
      articlesByFeedId.solo.push(makeArticle(`a-${i}`, "solo", `Unique title ${i}`, i % 5));
    }
    useFeedStore.setState({ feeds });
    useArticleStore.setState({ articlesByFeedId });

    renderAt();
    await waitFor(() => expect(useSignalStore.getState().status).toBe("ready"));
    expect(screen.getByText(/no clear signal/i)).toBeInTheDocument();
  });

  it("renders topic headers and article rows when the engine produces topics", async () => {
    const feeds: Feed[] = Array.from({ length: 4 }, (_, i) => makeFeed(`f${i + 1}`, `Outlet ${i + 1}`));
    const articlesByFeedId: Record<string, Article[]> = {};
    const variants = [
      "OpenAI ships GPT release",
      "OpenAI hires research team",
      "OpenAI partners Microsoft",
      "OpenAI cuts API prices",
      "OpenAI opens Tokyo office",
      "OpenAI updates safety policy",
      "OpenAI hosts developer event",
      "OpenAI launches Atlas browser",
    ];
    let id = 0;
    for (let i = 0; i < SIGNAL_CORPUS_GATE + 20; i++) {
      const feedId = `f${(i % 4) + 1}`;
      const title =
        i % 5 === 0 ? variants[i % variants.length] : `Unique${i} subject${i} item${i}`;
      if (!articlesByFeedId[feedId]) articlesByFeedId[feedId] = [];
      articlesByFeedId[feedId].push(makeArticle(`a-${id++}`, feedId, title, i % 5));
    }
    useFeedStore.setState({ feeds });
    useArticleStore.setState({ articlesByFeedId });

    renderAt();
    await waitFor(() => expect(useSignalStore.getState().status).toBe("ready"));

    // displayTerm "OpenAI" — chip uses CSS uppercase, DOM keeps original case
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    // At least one article row from the openai variants is shown.
    expect(screen.getByText(/OpenAI ships GPT release/)).toBeInTheDocument();
    // Window caption visible
    expect(screen.getByText(/last 7 days/i)).toBeInTheDocument();
  });

  it("Refresh button bypasses the cache", async () => {
    const feeds: Feed[] = Array.from({ length: 4 }, (_, i) => makeFeed(`f${i + 1}`));
    const articlesByFeedId: Record<string, Article[]> = {};
    for (let i = 0; i < SIGNAL_CORPUS_GATE + 20; i++) {
      const feedId = `f${(i % 4) + 1}`;
      if (!articlesByFeedId[feedId]) articlesByFeedId[feedId] = [];
      articlesByFeedId[feedId].push(
        makeArticle(`a-${i}`, feedId, `OpenAI Atlas note ${i}`, i % 5),
      );
    }
    useFeedStore.setState({ feeds });
    useArticleStore.setState({ articlesByFeedId });

    renderAt();
    await waitFor(() => expect(useSignalStore.getState().status).toBe("ready"));
    const first = useSignalStore.getState().report?.generatedAt;

    vi.setSystemTime(NOW + 60 * 60 * 1000);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(useSignalStore.getState().report?.generatedAt).not.toBe(first));
  });

  it("clicking an article navigates to its reader route", async () => {
    const feeds: Feed[] = Array.from({ length: 4 }, (_, i) => makeFeed(`f${i + 1}`));
    const articlesByFeedId: Record<string, Article[]> = { f1: [], f2: [], f3: [], f4: [] };
    let id = 0;
    // 30 OpenAI articles spread across all 4 feeds.
    for (let i = 0; i < 30; i++) {
      const feedId = `f${(i % 4) + 1}`;
      articlesByFeedId[feedId].push(
        makeArticle(`o-${id++}`, feedId, `OpenAI Atlas update ${i}`, i % 5),
      );
    }
    // 90 unique-noise articles so total >= gate.
    for (let i = 0; i < 90; i++) {
      const feedId = `f${(i % 4) + 1}`;
      articlesByFeedId[feedId].push(
        makeArticle(`n-${id++}`, feedId, `Unique${i} item${i}`, i % 5),
      );
    }
    useFeedStore.setState({ feeds });
    useArticleStore.setState({ articlesByFeedId });

    renderAt();
    await waitFor(() => expect(useSignalStore.getState().status).toBe("ready"));
    const link = screen.getAllByText(/OpenAI Atlas update/)[0];
    const user = userEvent.setup();
    await user.click(link);
    await waitFor(() => expect(screen.getByText("READER")).toBeInTheDocument());
  });

  it("loads from localStorage on mount without recomputing when the cache is fresh", async () => {
    const feeds: Feed[] = Array.from({ length: 4 }, (_, i) => makeFeed(`f${i + 1}`));
    const articlesByFeedId: Record<string, Article[]> = {};
    for (let i = 0; i < SIGNAL_CORPUS_GATE + 20; i++) {
      const feedId = `f${(i % 4) + 1}`;
      if (!articlesByFeedId[feedId]) articlesByFeedId[feedId] = [];
      articlesByFeedId[feedId].push(
        makeArticle(`a-${i}`, feedId, `OpenAI Atlas note ${i}`, i % 5),
      );
    }
    useFeedStore.setState({ feeds });
    useArticleStore.setState({ articlesByFeedId });

    // Prime the cache directly.
    localStorage.setItem(
      SIGNAL_REPORT_CACHE_KEY,
      JSON.stringify({
        report: {
          topics: [
            {
              term: "primed",
              displayTerm: "Primed",
              articleIds: [],
              feedCount: 2,
            },
          ],
          window: "7d",
          corpusSize: SIGNAL_CORPUS_GATE + 20,
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
});
