import { create } from "zustand";
import { useArticleStore } from "./article-store.ts";
import { useFeedStore } from "./feed-store.ts";
import { generateReport, pickWindow } from "../core/signal/frequency-engine.ts";
import {
  SIGNAL_CORPUS_GATE,
  SIGNAL_REPORT_SCHEMA_VERSION,
  SIGNAL_REPORT_TTL_MS,
  type SignalReport,
} from "../core/signal/types.ts";
import type { Article } from "../types/index.ts";

/**
 * localStorage key holding the most recent Signal report. The report is
 * cheap to recompute (<100ms for a few thousand articles) but caching
 * keeps revisits within the day instant and lets the empty-on-boot
 * flicker go away on the second open.
 */
export const SIGNAL_REPORT_CACHE_KEY = "feedzero:signal-report";

/**
 * Cache is invalidated when the chosen window changes (the corpus
 * skewed older/newer) or the corpus size shifts by ≥ this fraction
 * (the user added or removed a sizeable batch of articles). A small
 * organic drift between sessions shouldn't force recomputation.
 */
const CORPUS_DRIFT_FRACTION = 0.1;

export type SignalStatus =
  | "idle"
  | "locked"
  | "loading"
  | "ready"
  | "error";

interface SignalStore {
  status: SignalStatus;
  report: SignalReport | null;
  /** Total articles in the user's store at last evaluation. */
  corpusSize: number;
  error: string | null;
  loadReport: (opts?: { force?: boolean }) => Promise<void>;
}

interface CachedReport {
  report: SignalReport;
}

export const useSignalStore = create<SignalStore>((set) => ({
  status: "idle",
  report: null,
  corpusSize: 0,
  error: null,

  loadReport: async (opts) => {
    const articles = collectAllArticles();
    const corpusSize = articles.length;

    if (corpusSize < SIGNAL_CORPUS_GATE) {
      set({ status: "locked", corpusSize, report: null, error: null });
      return;
    }

    if (!opts?.force) {
      const cached = readCache();
      const now = Date.now();
      if (
        cached &&
        isFresh(cached.report, now) &&
        matchesCorpus(cached.report, corpusSize) &&
        matchesWindow(cached.report, articles, now)
      ) {
        set({ status: "ready", report: cached.report, corpusSize, error: null });
        return;
      }
    }

    set({ status: "loading", error: null, corpusSize });
    // Microtask hand-off so subscribers see the "loading" frame before
    // the synchronous engine work runs. Keeps the UI honest about the
    // (brief) compute step without forcing a real Worker for v1.
    await Promise.resolve();

    const { feeds } = useFeedStore.getState();
    const result = generateReport(articles, { feeds }, Date.now());

    if (!result.ok) {
      set({ status: "error", error: result.error, corpusSize });
      return;
    }

    writeCache({ report: result.value });
    set({ status: "ready", report: result.value, corpusSize, error: null });
  },
}));

function collectAllArticles(): Article[] {
  const grouped = useArticleStore.getState().articlesByFeedId;
  const out: Article[] = [];
  for (const list of Object.values(grouped)) out.push(...list);
  return out;
}

function readCache(): CachedReport | null {
  try {
    const raw = localStorage.getItem(SIGNAL_REPORT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.report || typeof parsed.report.generatedAt !== "number") {
      return null;
    }
    // Discard a report written by a build with an incompatible shape.
    if (parsed.report.schemaVersion !== SIGNAL_REPORT_SCHEMA_VERSION) {
      return null;
    }
    return { report: parsed.report as SignalReport };
  } catch {
    return null;
  }
}

function writeCache(cache: CachedReport): void {
  try {
    localStorage.setItem(SIGNAL_REPORT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota exceeded or storage unavailable */
  }
}

function isFresh(report: SignalReport, now: number): boolean {
  return now - report.generatedAt < SIGNAL_REPORT_TTL_MS;
}

function matchesCorpus(report: SignalReport, currentSize: number): boolean {
  if (report.corpusSize === 0) return false;
  const drift = Math.abs(currentSize - report.corpusSize) / report.corpusSize;
  return drift < CORPUS_DRIFT_FRACTION;
}

function matchesWindow(report: SignalReport, articles: Article[], now: number): boolean {
  return pickWindow(articles, now).window === report.window;
}
