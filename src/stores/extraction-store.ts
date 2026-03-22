import { create } from "zustand";
import { extract } from "../core/extractor/extractor.ts";
import { registry } from "../core/extractor/adapters/index.ts";
import { proxyFetch } from "../core/proxy/proxy-fetch.ts";
import type { ExtractionStatus } from "../components/reader/view-toggle.tsx";

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
          cache: { ...get().cache, [url]: result.value.content },
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
