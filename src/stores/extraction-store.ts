import { create } from "zustand";
import { proxyFetch } from "../core/proxy/proxy-fetch.ts";

/**
 * Defuddle is the bulk of the production bundle's "ready to extract"
 * cost — it ships with a DOM cleaner and a heuristic pipeline that
 * dwarfs the rest of the reader. Most reading sessions never click
 * "Extracted", so we pay the bytes for a feature the user may not use.
 *
 * Solution: import extract() + the adapter registry only when
 * `fetchExtracted` actually runs. Vite splits these into their own
 * chunk; first paint drops the Defuddle weight; the toggle still
 * feels instant because the chunk is one network round-trip.
 */
async function loadExtractor(): Promise<typeof import("../core/extractor/extractor.ts")> {
  return import("../core/extractor/extractor.ts");
}
async function loadAdapterRegistry(): Promise<typeof import("../core/extractor/adapters/index.ts")> {
  return import("../core/extractor/adapters/index.ts");
}

export type ExtractionStatus = "idle" | "extracting" | "available" | "failed";

interface ExtractionStore {
  cache: Record<string, string>;
  /** Per-URL extraction status: idle → extracting → available / failed */
  statusMap: Record<string, ExtractionStatus>;
  viewMode: "feed" | "extracted";
  setViewMode: (mode: "feed" | "extracted") => void;
  toggleViewMode: (articleLink: string | undefined) => void;
  switchToExtracted: (articleLink: string | undefined) => void;
  /** Start extraction in background without switching view mode. */
  extractInBackground: (articleLink: string | undefined) => void;
  fetchExtracted: (url: string) => Promise<void>;
  resetForArticle: () => void;
  getStatus: (url: string | undefined) => ExtractionStatus;
}

const MAX_CACHE_SIZE = 50;

/** Evict oldest entries if cache exceeds max size. */
function evictCache(cache: Record<string, string>): Record<string, string> {
  const keys = Object.keys(cache);
  if (keys.length <= MAX_CACHE_SIZE) return cache;
  const evicted = { ...cache };
  const toRemove = keys.length - MAX_CACHE_SIZE;
  for (let i = 0; i < toRemove; i++) {
    delete evicted[keys[i]];
  }
  return evicted;
}

export const useExtractionStore = create<ExtractionStore>((set, get) => ({
  cache: {},
  statusMap: {},
  viewMode: "feed",

  setViewMode: (mode) => set({ viewMode: mode }),

  toggleViewMode: (articleLink) => {
    if (get().viewMode === "feed") {
      get().switchToExtracted(articleLink);
    } else {
      set({ viewMode: "feed" });
    }
  },

  switchToExtracted: (articleLink) => {
    set({ viewMode: "extracted" });
    if (articleLink && !get().cache[articleLink]) {
      get().fetchExtracted(articleLink);
    }
  },

  extractInBackground: (articleLink) => {
    if (!articleLink) return;
    if (get().cache[articleLink]) return;
    if (get().statusMap[articleLink] === "extracting") return;
    get().fetchExtracted(articleLink);
  },

  fetchExtracted: async (url) => {
    if (get().cache[url]) return;

    set({
      statusMap: { ...get().statusMap, [url]: "extracting" },
    });

    try {
      // Lazy-load the extractor + adapter registry. Both pull in
      // Defuddle's HTML pipeline, which we don't want on first paint.
      const [{ extract }, { registry }] = await Promise.all([
        loadExtractor(),
        loadAdapterRegistry(),
      ]);

      const adapter = registry.findAdapter(url);
      const sourceUrl = adapter?.getSourceUrl?.(url) ?? url;

      const response = await proxyFetch("/api/page", sourceUrl);
      if (!response.ok) {
        set({
          statusMap: { ...get().statusMap, [url]: "failed" },
        });
        return;
      }
      const text = await response.text();
      const result = extract(text, url);
      if (result.ok && result.value.content) {
        set({
          cache: evictCache({ ...get().cache, [url]: result.value.content }),
          statusMap: { ...get().statusMap, [url]: "available" },
        });
      } else {
        set({
          statusMap: { ...get().statusMap, [url]: "failed" },
        });
      }
    } catch {
      set({
        statusMap: { ...get().statusMap, [url]: "failed" },
      });
    }
  },

  resetForArticle: () => set({ viewMode: "feed" }),

  getStatus: (url) => {
    if (!url) return "idle";
    if (get().cache[url]) return "available";
    return get().statusMap[url] || "idle";
  },
}));
