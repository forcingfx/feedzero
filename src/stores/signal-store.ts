import { create } from "zustand";
import { useArticleStore } from "./article-store.ts";
import { useFeedStore } from "./feed-store.ts";
import { generateFrontpage } from "../core/signal/frontpage-generator.ts";
import {
  FRONTPAGE_TTL_MS,
  SIGNAL_ARTICLE_CAP,
  SIGNAL_WINDOW_MS,
  type Frontpage,
  type FrontpageStory,
} from "../core/signal/types.ts";
import type { Article } from "../types";
import { LOCAL_STORAGE } from "../utils/constants.ts";

export const FRONTPAGE_CACHE_KEY = "feedzero:signal-frontpage";

export type SignalStatus =
  | "idle"
  | "loading"
  | "ready"
  | "no-content"
  | "error";

/** A top story with article ids resolved to full Article objects. */
export interface ResolvedTopStory {
  /** Stable id derived from the article id set, used as React key. */
  id: string;
  headline: string;
  blurb: string;
  articles: Article[];
}

interface SignalStore {
  apiKey: string | null;
  status: SignalStatus;
  topStories: ResolvedTopStory[];
  /** When the current frontpage was produced (epoch ms). Drives the 24h cache. */
  generatedAt: number | null;
  error: string | null;

  init: () => void;
  setApiKey: (key: string | null) => void;
  loadFrontpage: (opts?: { force?: boolean }) => Promise<void>;
}

export const useSignalStore = create<SignalStore>((set, get) => ({
  apiKey: null,
  status: "idle",
  topStories: [],
  generatedAt: null,
  error: null,

  init: () => {
    const stored = localStorage.getItem(LOCAL_STORAGE.LLM_KEY);
    set({ apiKey: stored && stored.trim() ? stored : null });
  },

  setApiKey: (key) => {
    if (key && key.trim()) {
      localStorage.setItem(LOCAL_STORAGE.LLM_KEY, key);
      set({ apiKey: key });
    } else {
      localStorage.removeItem(LOCAL_STORAGE.LLM_KEY);
      try {
        localStorage.removeItem(FRONTPAGE_CACHE_KEY);
      } catch {
        /* localStorage unavailable */
      }
      set({
        apiKey: null,
        topStories: [],
        generatedAt: null,
        status: "idle",
      });
    }
  },

  loadFrontpage: async (opts) => {
    const apiKey = get().apiKey;
    const articles = collectRecentArticles();

    if (!apiKey) {
      set({ status: "idle" });
      return;
    }

    if (!opts?.force) {
      const cached = readCache();
      if (cached && isFresh(cached, Date.now())) {
        applyFrontpage(cached.frontpage, articles, cached.generatedAt, set);
        return;
      }
    }

    set({ status: "loading", error: null });
    const { feeds, folders } = useFeedStore.getState();
    const result = await generateFrontpage(
      articles,
      { feeds, folders },
      apiKey,
      new AbortController().signal,
    );

    if (!result.ok) {
      set({ status: "error", error: result.error });
      return;
    }

    const generatedAt = Date.now();
    writeCache({ generatedAt, frontpage: result.value });
    applyFrontpage(result.value, articles, generatedAt, set);
  },
}));

// ----- helpers --------------------------------------------------------------

interface CachedFrontpage {
  generatedAt: number;
  frontpage: Frontpage;
}

function readCache(): CachedFrontpage | null {
  try {
    const raw = localStorage.getItem(FRONTPAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.generatedAt !== "number" ||
      !parsed?.frontpage ||
      !Array.isArray(parsed.frontpage.topStories)
    ) {
      return null;
    }
    // Tolerate legacy caches that included a `swimlanes` key — strip it.
    return {
      generatedAt: parsed.generatedAt,
      frontpage: { topStories: parsed.frontpage.topStories },
    };
  } catch {
    return null;
  }
}

function writeCache(cache: CachedFrontpage): void {
  try {
    localStorage.setItem(FRONTPAGE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota exceeded or storage unavailable */
  }
}

function isFresh(cache: CachedFrontpage, now: number): boolean {
  return now - cache.generatedAt < FRONTPAGE_TTL_MS;
}

function applyFrontpage(
  frontpage: Frontpage,
  articles: Article[],
  generatedAt: number,
  set: (partial: Partial<SignalStore>) => void,
): void {
  const articleMap = new Map(articles.map((a) => [a.id, a]));
  const topStories = resolveTopStories(frontpage.topStories, articleMap);
  const status: SignalStatus = topStories.length === 0 ? "no-content" : "ready";
  set({ status, topStories, generatedAt, error: null });
}

function resolveTopStories(
  stories: FrontpageStory[],
  articleMap: Map<string, Article>,
): ResolvedTopStory[] {
  const out: ResolvedTopStory[] = [];
  for (const story of stories) {
    const resolved = story.articleIds
      .map((id) => articleMap.get(id))
      .filter((a): a is Article => a !== undefined);
    if (resolved.length === 0) continue;
    out.push({
      id: story.articleIds.slice().sort().join("|"),
      headline: story.headline,
      blurb: story.blurb,
      articles: resolved,
    });
  }
  return out;
}

/**
 * Articles within the recency window, newest-first, capped. The LLM only
 * sees articles that are eligible to lead the page.
 */
function collectRecentArticles(): Article[] {
  const grouped = useArticleStore.getState().articlesByFeedId;
  const all: Article[] = [];
  for (const list of Object.values(grouped)) all.push(...list);
  const cutoff = Date.now() - SIGNAL_WINDOW_MS;
  return all
    .filter((a) => a.publishedAt >= cutoff)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, SIGNAL_ARTICLE_CAP);
}
