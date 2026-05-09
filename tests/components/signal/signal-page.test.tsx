import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("../../../src/core/signal/frontpage-generator.ts", () => ({
  generateFrontpage: vi.fn(),
}));

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

import { SignalPage } from "../../../src/components/signal/signal-page.tsx";
import {
  useSignalStore,
  type ResolvedTopStory,
} from "../../../src/stores/signal-store.ts";
import { useFeedStore } from "../../../src/stores/feed-store.ts";
import type { Feed, Article } from "../../../src/types";

const FEED_A: Feed = {
  id: "f1", url: "u", title: "Outlet A", description: "",
  siteUrl: "https://a.example.com", createdAt: 0, updatedAt: 0,
};
const FEED_B: Feed = { ...FEED_A, id: "f2", title: "Outlet B", siteUrl: "https://b.example.com" };

const ART_A: Article = {
  id: "x1", feedId: "f1", guid: "x1", title: "T1",
  link: "https://a.example.com/x1", content: "", summary: "", author: "",
  publishedAt: Date.now(), read: false, createdAt: Date.now(),
};
const ART_B: Article = { ...ART_A, id: "x2", feedId: "f2", title: "T2", link: "https://b.example.com/x2" };

const HERO: ResolvedTopStory = {
  id: "x1|x2",
  headline: "Hero headline",
  blurb: "Hero blurb.",
  articles: [ART_A, ART_B],
};

const SECOND: ResolvedTopStory = {
  id: "x2",
  headline: "Second story",
  blurb: "Second blurb.",
  articles: [ART_B],
};

const THIRD: ResolvedTopStory = {
  id: "x1",
  headline: "Third story",
  blurb: "Third blurb.",
  articles: [ART_A],
};

function renderPage(initialPath = "/signal") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/signal" element={<SignalPage />} />
        <Route
          path="/feeds/:feedId/articles/:articleId"
          element={<div data-testid="article-route" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SignalPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useSignalStore.setState({
      apiKey: null,
      status: "idle",
      topStories: [],
      generatedAt: null,
      error: null,
      init: () => {},
      loadFrontpage: async () => {},
    });
    useFeedStore.setState({ feeds: [FEED_A, FEED_B] });
  });

  afterEach(() => vi.restoreAllMocks());

  it("renders empty 'add a key' form when apiKey is null", async () => {
    renderPage();
    expect(await screen.findByText(/Add an Anthropic API key/i)).toBeInTheDocument();
  });

  it("submitting the key form persists it and triggers a load", async () => {
    const user = userEvent.setup();
    const setApiKey = vi.fn((key: string | null) => useSignalStore.setState({ apiKey: key }));
    const loadFrontpage = vi.fn(async () => {});
    useSignalStore.setState({ setApiKey, loadFrontpage });
    renderPage();
    const input = await screen.findByLabelText(/Anthropic API key/i);
    await user.type(input, "sk-ant-userentry");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(setApiKey).toHaveBeenCalledWith("sk-ant-userentry");
    expect(loadFrontpage).toHaveBeenCalled();
  });

  it("renders the loading state with cycling favicons during 'loading' status", async () => {
    localStorage.setItem("feedzero:llm-key", "sk-test");
    useSignalStore.setState({ apiKey: "sk-test", status: "loading" });
    const { container } = renderPage();
    await waitFor(() =>
      expect(container.querySelector('[data-testid="signal-loading"]')).not.toBeNull(),
    );
    expect(container.innerHTML).toMatch(/animate-(pulse|spin|ping|bounce)/);
  });

  it("renders 'no content yet' state when status is no-content", async () => {
    localStorage.setItem("feedzero:llm-key", "sk-test");
    useSignalStore.setState({ apiKey: "sk-test", status: "no-content" });
    renderPage();
    expect(await screen.findByText(/nothing to surface/i)).toBeInTheDocument();
  });

  it("renders #1 as the hero and #2+ as numbered list items", async () => {
    localStorage.setItem("feedzero:llm-key", "sk-test");
    useSignalStore.setState({
      apiKey: "sk-test",
      status: "ready",
      topStories: [HERO, SECOND, THIRD],
    });
    renderPage();
    // Hero renders its headline
    expect(await screen.findByText("Hero headline")).toBeInTheDocument();
    // Listicle items render their numbers
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Second story")).toBeInTheDocument();
    expect(screen.getByText("Third story")).toBeInTheDocument();
    // Hero does NOT get a "1" label — its rank is implicit in the layout
    expect(screen.queryByText(/^1$/)).toBeNull();
  });

  it("clicking a multi-article hero opens an article chooser dialog", async () => {
    const user = userEvent.setup();
    localStorage.setItem("feedzero:llm-key", "sk-test");
    useSignalStore.setState({
      apiKey: "sk-test",
      status: "ready",
      topStories: [HERO],
    });
    renderPage();
    await user.click(await screen.findByRole("article"));
    const chooser = await screen.findByTestId("cluster-chooser");
    expect(within(chooser).getByText("T1")).toBeInTheDocument();
    expect(within(chooser).getByText("T2")).toBeInTheDocument();
  });

  it("clicking a single-article list item navigates to the article", async () => {
    const user = userEvent.setup();
    localStorage.setItem("feedzero:llm-key", "sk-test");
    useSignalStore.setState({
      apiKey: "sk-test",
      status: "ready",
      topStories: [HERO, SECOND],
    });
    renderPage();
    const articles = await screen.findAllByRole("article");
    // Click the second one (the list-item, single article → direct navigation)
    await user.click(articles[1]);
    expect(screen.getByTestId("article-route")).toBeInTheDocument();
  });

  it("regenerate button calls loadFrontpage with force=true", async () => {
    const user = userEvent.setup();
    const loadFrontpage = vi.fn(async () => {});
    localStorage.setItem("feedzero:llm-key", "sk-test");
    useSignalStore.setState({
      apiKey: "sk-test",
      status: "ready",
      topStories: [HERO],
      init: () => {},
      loadFrontpage,
    });
    renderPage();
    await user.click(await screen.findByRole("button", { name: /regenerate/i }));
    expect(loadFrontpage).toHaveBeenCalledWith({ force: true });
  });

  it("manage-key control disconnects the API key", async () => {
    const user = userEvent.setup();
    const setApiKey = vi.fn();
    localStorage.setItem("feedzero:llm-key", "sk-test");
    useSignalStore.setState({
      apiKey: "sk-test",
      status: "no-content",
      setApiKey,
    });
    renderPage();
    await user.click(await screen.findByRole("button", { name: /api key/i }));
    await user.click(await screen.findByRole("button", { name: /disconnect/i }));
    expect(setApiKey).toHaveBeenCalledWith(null);
  });
});
