/**
 * Zustand store for the AI-generated /signal overview.
 *
 * Parallel to `signal-store` (which owns the local ML path) rather
 * than folded in, so the ML path stays untouched and the "fully
 * local, no LLM" promise has a clean boundary at the store layer:
 *  - signal-store: pure local, no network, no LLM
 *  - ai-signal-store: BYO-key, hits the same /api/briefing relay
 *    Briefings uses
 *
 * Once-per-day auto-refresh: the AI overview is expensive (5-10
 * cents/run at Sonnet), so we cap automatic refreshes at one per
 * 24h. The user's explicit Refresh button is unaffected.
 * `lastAutoRefreshAt` is persisted to localStorage so the rule
 * survives tab close.
 *
 * Cache: the most-recent AI report is persisted to localStorage with
 * the same TTL + drift rules as the ML cache, so a returning user
 * sees yesterday's AI overview instantly while a fresh one bakes
 * (or doesn't, if it's been < 24h).
 */

import { create } from "zustand";
import { useArticleStore } from "./article-store";
import { useFeedStore } from "./feed-store";
import { generateAIOverview } from "../core/signal/ai-overview-client";
import { pickWindow } from "../core/signal/frequency-engine";
import {
  SIGNAL_CORPUS_GATE,
  SIGNAL_REPORT_SCHEMA_VERSION,
  SIGNAL_REPORT_TTL_MS,
  type AISignalReport,
} from "../core/signal/types";
import { getAnthropicKey } from "../core/storage/secrets";
import { getBriefingModelPreference } from "../lib/briefing-model-preference";
import type { Article } from "@feedzero/core/types";

export const AI_SIGNAL_REPORT_CACHE_KEY = "feedzero:ai-signal-report";
export const AI_SIGNAL_LAST_AUTO_KEY = "feedzero:ai-signal-last-auto";

/** Once-per-day cap on automatic refreshes. */
export const AI_SIGNAL_AUTO_REFRESH_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

const CORPUS_DRIFT_FRACTION = 0.1;

export type AISignalStatus =
  | "idle"
  | "locked"
  | "no-api-key"
  | "loading"
  | "ready"
  | "error";

interface AISignalStore {
  status: AISignalStatus;
  report: AISignalReport | null;
  corpusSize: number;
  error: string | null;
  /** Wall-clock when the current loading run started (for skeleton timing). */
  loadingStartedAt: number | null;
  /**
   * Trigger a refresh.
   *  - `force: true`     → ignore cache + auto-refresh cap; user clicked Refresh.
   *  - default            → use cache when fresh, otherwise run once per 24h
   *                         max (the daily auto-refresh rule).
   */
  loadReport: (opts?: { force?: boolean }) => Promise<void>;
}

export const useAISignalStore = create<AISignalStore>((set) => ({
  status: "idle",
  report: null,
  corpusSize: 0,
  error: null,
  loadingStartedAt: null,

  loadReport: async (opts) => {
    const articles = collectAllArticles();
    const corpusSize = articles.length;

    if (corpusSize < SIGNAL_CORPUS_GATE) {
      set({
        status: "locked",
        corpusSize,
        report: null,
        error: null,
        loadingStartedAt: null,
      });
      return;
    }

    const now = Date.now();
    const cached = readCache();

    // Cache hit: report is fresh + the corpus hasn't drifted meaningfully.
    if (
      !opts?.force &&
      cached &&
      isFresh(cached, now) &&
      matchesCorpus(cached, corpusSize)
    ) {
      set({
        status: "ready",
        report: cached,
        corpusSize,
        error: null,
        loadingStartedAt: null,
      });
      return;
    }

    // Daily auto-refresh cap. The user's explicit `{force: true}` always
    // bypasses; otherwise we only run when the last AUTO run was >24h
    // ago. If we're inside the window and there's no fresh cache to
    // show, render whatever cache we have (even stale) so the page
    // isn't empty.
    if (!opts?.force) {
      const lastAuto = readLastAutoRefreshAt();
      if (lastAuto !== null && now - lastAuto < AI_SIGNAL_AUTO_REFRESH_MIN_INTERVAL_MS) {
        if (cached) {
          set({
            status: "ready",
            report: cached,
            corpusSize,
            error: null,
            loadingStartedAt: null,
          });
        } else {
          set({
            status: "idle",
            report: null,
            corpusSize,
            error: null,
            loadingStartedAt: null,
          });
        }
        return;
      }
    }

    // Need an API key to actually call the relay.
    const keyResult = await getAnthropicKey();
    const apiKey = keyResult.ok ? keyResult.value : null;
    if (!apiKey) {
      set({
        status: "no-api-key",
        report: null,
        corpusSize,
        error: null,
        loadingStartedAt: null,
      });
      return;
    }

    const { window } = pickWindow(articles, now);
    const inWindow = articles.filter((a) => inSignalWindow(a, window, now));
    const corpus = inWindow.length > 0 ? inWindow : articles;

    set({ status: "loading", loadingStartedAt: now, error: null, corpusSize });

    const result = await generateAIOverview({
      articles: corpus,
      window,
      apiKey,
      modelId: getBriefingModelPreference(),
      now,
    });

    if (!result.ok) {
      set({
        status: "error",
        error: result.error,
        corpusSize,
        loadingStartedAt: null,
      });
      return;
    }

    writeCache(result.value);
    // Stamp lastAutoRefreshAt regardless of whether this run was forced
    // or auto — both consume the daily budget so a force-refresh
    // doesn't queue an additional auto-refresh on top.
    writeLastAutoRefreshAt(now);

    set({
      status: "ready",
      report: result.value,
      corpusSize,
      error: null,
      loadingStartedAt: null,
    });
  },
}));

function collectAllArticles(): Article[] {
  const grouped = useArticleStore.getState().articlesByFeedId;
  const out: Article[] = [];
  for (const list of Object.values(grouped)) out.push(...list);
  return out;
}

/** Same window predicate the frequency engine uses. */
function inSignalWindow(a: Article, window: string, now: number): boolean {
  if (window === "all") return true;
  const days = window === "7d" ? 7 : window === "14d" ? 14 : 30;
  return now - a.publishedAt < days * 24 * 60 * 60 * 1000;
}

function readCache(): AISignalReport | null {
  try {
    const raw = localStorage.getItem(AI_SIGNAL_REPORT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AISignalReport>;
    if (
      !parsed ||
      parsed.schemaVersion !== SIGNAL_REPORT_SCHEMA_VERSION ||
      parsed.source !== "ai" ||
      typeof parsed.generatedAt !== "number"
    ) {
      return null;
    }
    return parsed as AISignalReport;
  } catch {
    return null;
  }
}

function writeCache(report: AISignalReport): void {
  try {
    localStorage.setItem(AI_SIGNAL_REPORT_CACHE_KEY, JSON.stringify(report));
  } catch {
    /* quota / unavailable */
  }
}

function readLastAutoRefreshAt(): number | null {
  try {
    const raw = localStorage.getItem(AI_SIGNAL_LAST_AUTO_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeLastAutoRefreshAt(ts: number): void {
  try {
    localStorage.setItem(AI_SIGNAL_LAST_AUTO_KEY, String(ts));
  } catch {
    /* quota / unavailable */
  }
}

function isFresh(report: AISignalReport, now: number): boolean {
  return now - report.generatedAt < SIGNAL_REPORT_TTL_MS;
}

function matchesCorpus(report: AISignalReport, currentSize: number): boolean {
  if (report.corpusSize === 0) return false;
  const drift = Math.abs(currentSize - report.corpusSize) / report.corpusSize;
  return drift < CORPUS_DRIFT_FRACTION;
}

// Helper used by tests to reset between cases. Not exported publicly.
useFeedStore; // keep import retained (referenced in some helpers via .getState)
