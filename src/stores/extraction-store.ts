import { create } from "zustand";
import { extract } from "../core/extractor/extractor.ts";
import { registry } from "../core/extractor/adapters/index.ts";

interface ExtractionStore {
  cache: Record<string, string>;
  viewMode: "feed" | "extracted";
  isExtracting: boolean;
  setViewMode: (mode: "feed" | "extracted") => void;
  fetchExtracted: (url: string) => Promise<void>;
  resetForArticle: () => void;
}

export const useExtractionStore = create<ExtractionStore>((set, get) => ({
  cache: {},
  viewMode: "feed",
  isExtracting: false,

  setViewMode: (mode) => set({ viewMode: mode }),

  fetchExtracted: async (url) => {
    if (get().cache[url]) return;

    set({ isExtracting: true });
    try {
      // Check if a site adapter wants to remap the URL
      const adapter = registry.findAdapter(url);
      const sourceUrl = adapter?.getSourceUrl?.(url) ?? url;

      const proxyUrl = `/api/page?url=${encodeURIComponent(sourceUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        set({ isExtracting: false });
        return;
      }
      const text = await response.text();
      const result = extract(text, url);
      if (result.ok && result.value.content) {
        set({ cache: { ...get().cache, [url]: result.value.content } });
      }
    } finally {
      set({ isExtracting: false });
    }
  },

  resetForArticle: () => set({ viewMode: "feed" }),
}));
