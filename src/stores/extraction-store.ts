import { create } from "zustand";
import { proxyFetch } from "../core/proxy/proxy-fetch.ts";
import { detectPaywall, type PaywallVerdict } from "../core/extractor/paywall-detectors/index.ts";
import { fetchArticle as extensionFetchArticle } from "../core/extension/protocol.ts";
import { useExtensionStore } from "./extension-store.ts";

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
  /**
   * Per-URL paywall verdict. Only populated when detectPaywall flagged the
   * fetched HTML; absence = no paywall observed. Reader-pane reads from
   * `getPaywallVerdict` to decide whether to render PaywallPrompt.
   */
  paywallMap: Record<string, PaywallVerdict & { paywalled: true }>;
  viewMode: "feed" | "extracted";
  setViewMode: (mode: "feed" | "extracted") => void;
  toggleViewMode: (articleLink: string | undefined) => void;
  switchToExtracted: (articleLink: string | undefined) => void;
  /** Start extraction in background without switching view mode. */
  extractInBackground: (articleLink: string | undefined) => void;
  fetchExtracted: (url: string) => Promise<void>;
  resetForArticle: () => void;
  getStatus: (url: string | undefined) => ExtractionStatus;
  getPaywallVerdict: (
    url: string | undefined,
  ) => (PaywallVerdict & { paywalled: true }) | null;
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
  paywallMap: {},
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
      const anonymousHtml = await response.text();

      const verdict = detectPaywall(anonymousHtml, url);
      if (verdict.paywalled) {
        await handlePaywalledFetch(url, verdict, extract, set, get);
        return;
      }

      const result = extract(anonymousHtml, url);
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

  getPaywallVerdict: (url) => {
    if (!url) return null;
    return get().paywallMap[url] ?? null;
  },
}));

type Extract = (html: string, url: string) => ReturnType<
  Awaited<ReturnType<typeof loadExtractor>>["extract"]
>;

/**
 * Reached when the anonymous proxy fetch returned content the detector
 * flagged. If the user's extension is authorized for the publisher, retry
 * the fetch with credentials and re-detect; on a clean retry, extract and
 * cache. Otherwise record the verdict so the reader pane can render
 * PaywallPrompt.
 */
async function handlePaywalledFetch(
  url: string,
  verdict: PaywallVerdict & { paywalled: true },
  extract: Extract,
  set: (
    partial: Partial<{
      cache: Record<string, string>;
      statusMap: Record<string, ExtractionStatus>;
      paywallMap: Record<string, PaywallVerdict & { paywalled: true }>;
    }>,
  ) => void,
  get: () => ExtractionStore,
): Promise<void> {
  const publisher = verdict.publisher;
  const ext = useExtensionStore.getState();
  const canRetry =
    publisher !== null &&
    ext.status === "installed" &&
    ext.authorizedDomains.includes(publisher);

  if (!canRetry) {
    recordPaywall(url, verdict, set, get);
    return;
  }

  const retry = await extensionFetchArticle(url);
  if (!retry.ok) {
    recordPaywall(url, verdict, set, get);
    return;
  }

  const retried = detectPaywall(retry.value.html, url);
  if (retried.paywalled) {
    // Authenticated fetch came back gated too — cookie has likely
    // expired since the user authorized the publisher.
    recordPaywall(
      url,
      { ...retried, reason: "session-expired" },
      set,
      get,
    );
    return;
  }

  const extracted = extract(retry.value.html, url);
  if (extracted.ok && extracted.value.content) {
    set({
      cache: evictCache({ ...get().cache, [url]: extracted.value.content }),
      statusMap: { ...get().statusMap, [url]: "available" },
    });
    // Clear any stale verdict from a prior anonymous fetch.
    if (get().paywallMap[url]) {
      const next = { ...get().paywallMap };
      delete next[url];
      set({ paywallMap: next });
    }
  } else {
    recordPaywall(url, verdict, set, get);
  }
}

function recordPaywall(
  url: string,
  verdict: PaywallVerdict & { paywalled: true },
  set: (
    partial: Partial<{
      statusMap: Record<string, ExtractionStatus>;
      paywallMap: Record<string, PaywallVerdict & { paywalled: true }>;
    }>,
  ) => void,
  get: () => ExtractionStore,
): void {
  set({
    statusMap: { ...get().statusMap, [url]: "failed" },
    paywallMap: { ...get().paywallMap, [url]: verdict },
  });
}
