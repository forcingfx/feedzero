import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useArticleStore } from "../../src/stores/article-store.ts";
import type { Article } from "../../src/types";
import { LOCAL_STORAGE } from "../../src/utils/constants.ts";
import { FRONTPAGE_TTL_MS } from "../../src/core/signal/types.ts";

vi.mock("../../src/core/signal/frontpage-generator.ts", () => ({
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
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

import { generateFrontpage } from "../../src/core/signal/frontpage-generator.ts";
import { useSignalStore, FRONTPAGE_CACHE_KEY } from "../../src/stores/signal-store.ts";

const NOW = Date.now();
const KEY = "sk-ant-test-XXXX";

function makeArticle(id: string, feedId: string, title: string): Article {
  return {
    id,
    feedId,
    guid: id,
    title,
    link: `https://example.com/${id}`,
    content: "",
    summary: "",
    author: "",
    publishedAt: NOW - 60 * 1000,
    read: false,
    createdAt: NOW,
  };
}

function seedArticles(articles: Article[]): void {
  const grouped: Record<string, Article[]> = {};
  for (const a of articles) (grouped[a.feedId] ??= []).push(a);
  useArticleStore.setState({ articlesByFeedId: grouped, articles });
}

function resetSignalStore(): void {
  useSignalStore.setState({
    apiKey: null,
    status: "idle",
    topStories: [],
    swimlanes: [],
    generatedAt: null,
    error: null,
  });
}

describe("signal-store", () => {
  const generateMock = generateFrontpage as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    resetSignalStore();
    seedArticles([]);
    generateMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------- init / setApiKey ---------------------------------------------

  it("init reads apiKey from localStorage", () => {
    localStorage.setItem(LOCAL_STORAGE.LLM_KEY, KEY);
    useSignalStore.getState().init();
    expect(useSignalStore.getState().apiKey).toBe(KEY);
  });

  it("setApiKey writes to localStorage and updates state", () => {
    useSignalStore.getState().setApiKey(KEY);
    expect(localStorage.getItem(LOCAL_STORAGE.LLM_KEY)).toBe(KEY);
    expect(useSignalStore.getState().apiKey).toBe(KEY);
  });

  it("setApiKey(null) removes the key and clears the cache", () => {
    localStorage.setItem(LOCAL_STORAGE.LLM_KEY, KEY);
    localStorage.setItem(
      FRONTPAGE_CACHE_KEY,
      JSON.stringify({ generatedAt: Date.now(), frontpage: { topStories: [], swimlanes: [] } }),
    );
    useSignalStore.getState().setApiKey(null);
    expect(localStorage.getItem(LOCAL_STORAGE.LLM_KEY)).toBeNull();
    expect(localStorage.getItem(FRONTPAGE_CACHE_KEY)).toBeNull();
    expect(useSignalStore.getState().apiKey).toBeNull();
  });

  // ---------- generation ----------------------------------------------------

  it("loadFrontpage with no apiKey does not call generateFrontpage", async () => {
    seedArticles([
      makeArticle("a1", "f1", "T1"),
      makeArticle("a2", "f2", "T2"),
    ]);
    await useSignalStore.getState().loadFrontpage();
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("populates topStories AND swimlanes with resolved articles", async () => {
    generateMock.mockResolvedValue({
      ok: true,
      value: {
        topStories: [
          { headline: "Top", blurb: "B.", articleIds: ["a1", "a2"] },
        ],
        swimlanes: [
          { title: "Lane 1", articleIds: ["a1", "a2"] },
          { title: "Lane 2", articleIds: ["b1"] },
        ],
      },
    });
    useSignalStore.getState().setApiKey(KEY);
    seedArticles([
      makeArticle("a1", "f1", "T1"),
      makeArticle("a2", "f2", "T2"),
      makeArticle("b1", "f3", "B1"),
    ]);

    await useSignalStore.getState().loadFrontpage();

    const state = useSignalStore.getState();
    expect(state.status).toBe("ready");
    expect(state.topStories).toHaveLength(1);
    expect(state.topStories[0].articles.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
    expect(state.swimlanes).toHaveLength(2);
    expect(state.swimlanes[0].title).toBe("Lane 1");
    expect(state.swimlanes[0].articles.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
  });

  it("drops top stories whose articleIds no longer exist locally", async () => {
    generateMock.mockResolvedValue({
      ok: true,
      value: {
        topStories: [
          { headline: "Real", blurb: "B.", articleIds: ["a1"] },
          { headline: "Stale", blurb: "B.", articleIds: ["aged-out"] },
        ],
        swimlanes: [],
      },
    });
    useSignalStore.getState().setApiKey(KEY);
    seedArticles([makeArticle("a1", "f1", "T")]);
    await useSignalStore.getState().loadFrontpage();
    expect(useSignalStore.getState().topStories).toHaveLength(1);
  });

  it("drops swimlanes whose articleIds no longer exist locally", async () => {
    generateMock.mockResolvedValue({
      ok: true,
      value: {
        topStories: [],
        swimlanes: [
          { title: "Real lane", articleIds: ["a1"] },
          { title: "Stale lane", articleIds: ["aged-out"] },
        ],
      },
    });
    useSignalStore.getState().setApiKey(KEY);
    seedArticles([makeArticle("a1", "f1", "T")]);
    await useSignalStore.getState().loadFrontpage();
    const lanes = useSignalStore.getState().swimlanes;
    expect(lanes).toHaveLength(1);
    expect(lanes[0].title).toBe("Real lane");
  });

  it("sets status to error when generation fails", async () => {
    generateMock.mockResolvedValue({ ok: false, error: "Anthropic is rate-limiting" });
    useSignalStore.getState().setApiKey(KEY);
    seedArticles([makeArticle("a1", "f1", "T")]);
    await useSignalStore.getState().loadFrontpage();
    expect(useSignalStore.getState().status).toBe("error");
    expect(useSignalStore.getState().error).toMatch(/rate-limit/i);
  });

  it("status is 'no-content' when both topStories AND swimlanes are empty", async () => {
    generateMock.mockResolvedValue({
      ok: true,
      value: { topStories: [], swimlanes: [] },
    });
    useSignalStore.getState().setApiKey(KEY);
    seedArticles([makeArticle("a1", "f1", "T")]);
    await useSignalStore.getState().loadFrontpage();
    expect(useSignalStore.getState().status).toBe("no-content");
  });

  // ---------- 24h cache ---------------------------------------------------

  it("loadFrontpage writes to localStorage on success", async () => {
    generateMock.mockResolvedValue({
      ok: true,
      value: {
        topStories: [{ headline: "h", blurb: "b", articleIds: ["a1"] }],
        swimlanes: [],
      },
    });
    useSignalStore.getState().setApiKey(KEY);
    seedArticles([makeArticle("a1", "f1", "T")]);
    await useSignalStore.getState().loadFrontpage();
    const cached = JSON.parse(localStorage.getItem(FRONTPAGE_CACHE_KEY)!);
    expect(cached.generatedAt).toBeTypeOf("number");
    expect(cached.frontpage.topStories[0].headline).toBe("h");
  });

  it("loadFrontpage uses cache within TTL and skips the LLM", async () => {
    localStorage.setItem(
      FRONTPAGE_CACHE_KEY,
      JSON.stringify({
        generatedAt: Date.now() - 60 * 1000,
        frontpage: {
          topStories: [{ headline: "cached", blurb: "B.", articleIds: ["a1"] }],
          swimlanes: [{ title: "cached lane", articleIds: ["a1"] }],
        },
      }),
    );
    useSignalStore.getState().setApiKey(KEY);
    seedArticles([makeArticle("a1", "f1", "T")]);

    await useSignalStore.getState().loadFrontpage();

    expect(generateMock).not.toHaveBeenCalled();
    const state = useSignalStore.getState();
    expect(state.topStories[0].headline).toBe("cached");
    expect(state.swimlanes[0].title).toBe("cached lane");
  });

  it("loadFrontpage regenerates when cache is older than the TTL", async () => {
    localStorage.setItem(
      FRONTPAGE_CACHE_KEY,
      JSON.stringify({
        generatedAt: Date.now() - FRONTPAGE_TTL_MS - 60 * 1000,
        frontpage: { topStories: [{ headline: "old", blurb: "B.", articleIds: ["a1"] }], swimlanes: [] },
      }),
    );
    generateMock.mockResolvedValue({
      ok: true,
      value: {
        topStories: [{ headline: "fresh", blurb: "B.", articleIds: ["a1"] }],
        swimlanes: [],
      },
    });
    useSignalStore.getState().setApiKey(KEY);
    seedArticles([makeArticle("a1", "f1", "T")]);
    await useSignalStore.getState().loadFrontpage();
    expect(generateMock).toHaveBeenCalled();
    expect(useSignalStore.getState().topStories[0].headline).toBe("fresh");
  });

  it("loadFrontpage({ force: true }) bypasses a fresh cache", async () => {
    localStorage.setItem(
      FRONTPAGE_CACHE_KEY,
      JSON.stringify({
        generatedAt: Date.now() - 60 * 1000,
        frontpage: { topStories: [{ headline: "cached", blurb: "B.", articleIds: ["a1"] }], swimlanes: [] },
      }),
    );
    generateMock.mockResolvedValue({
      ok: true,
      value: {
        topStories: [{ headline: "fresh", blurb: "B.", articleIds: ["a1"] }],
        swimlanes: [],
      },
    });
    useSignalStore.getState().setApiKey(KEY);
    seedArticles([makeArticle("a1", "f1", "T")]);
    await useSignalStore.getState().loadFrontpage({ force: true });
    expect(generateMock).toHaveBeenCalled();
    expect(useSignalStore.getState().topStories[0].headline).toBe("fresh");
  });

  // ---------- corpus filter -----------------------------------------------

  it("filters the corpus to the recency window before calling generateFrontpage", async () => {
    generateMock.mockResolvedValue({ ok: true, value: { topStories: [], swimlanes: [] } });
    useSignalStore.getState().setApiKey(KEY);
    const recent = makeArticle("recent", "f1", "Recent");
    const tooOld: Article = {
      ...makeArticle("old", "f2", "Old"),
      publishedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    };
    seedArticles([recent, tooOld]);
    await useSignalStore.getState().loadFrontpage();
    const sentArticles = generateMock.mock.calls[0][0] as Article[];
    expect(sentArticles.map((a) => a.id)).toContain("recent");
    expect(sentArticles.map((a) => a.id)).not.toContain("old");
  });

  it("sorts the corpus newest-first before sending", async () => {
    generateMock.mockResolvedValue({ ok: true, value: { topStories: [], swimlanes: [] } });
    useSignalStore.getState().setApiKey(KEY);
    const t = Date.now();
    const older: Article = { ...makeArticle("older", "f1", "Older"), publishedAt: t - 5 * 60 * 60 * 1000 };
    const newer: Article = { ...makeArticle("newer", "f2", "Newer"), publishedAt: t - 30 * 60 * 1000 };
    seedArticles([older, newer]);
    await useSignalStore.getState().loadFrontpage();
    const sentArticles = generateMock.mock.calls[0][0] as Article[];
    expect(sentArticles[0].id).toBe("newer");
    expect(sentArticles[1].id).toBe("older");
  });
});
