import { create } from "zustand";

/** Result of importing a single feed URL. */
export interface ImportResult {
  url: string;
  success: boolean;
  error?: string;
  /**
   * Set when the feed was added as a placeholder (initial fetch failed but
   * we persisted the URL so the user can retry via refresh). Counts as a
   * success because the row exists in the sidebar, but the UI surfaces it
   * separately (amber "queued for retry") to set expectations.
   */
  placeholder?: boolean;
}

/** Import status state machine: idle → importing → complete | error */
export type ImportStatus = "idle" | "importing" | "complete" | "error";

interface ImportStore {
  // State
  status: ImportStatus;
  urls: string[];
  currentIndex: number;
  results: ImportResult[];
  error: string | null;

  // Actions
  startImport: (urls: string[]) => void;
  recordResult: (result: ImportResult) => void;
  setError: (error: string) => void;
  reset: () => void;
}

const initialState = {
  status: "idle" as ImportStatus,
  urls: [] as string[],
  currentIndex: 0,
  results: [] as ImportResult[],
  error: null as string | null,
};

export const useImportStore = create<ImportStore>((set, get) => ({
  ...initialState,

  startImport: (urls) => {
    if (urls.length === 0) {
      set({ status: "error", error: "No URLs to import" });
      return;
    }
    set({
      status: "importing",
      urls,
      currentIndex: 0,
      results: [],
      error: null,
    });
  },

  recordResult: (result) => {
    const { urls, currentIndex, results } = get();
    const newResults = [...results, result];
    const newIndex = currentIndex + 1;
    const isComplete = newIndex >= urls.length;

    set({
      results: newResults,
      currentIndex: newIndex,
      status: isComplete ? "complete" : "importing",
    });
  },

  setError: (error) => {
    set({ status: "error", error });
  },

  reset: () => {
    set(initialState);
  },
}));

/** Selector: total count of URLs to import */
export function selectTotalCount(state: Pick<ImportStore, "urls">): number {
  return state.urls.length;
}

/** Selector: count of fully-imported feeds (success and not a placeholder). */
export function selectSuccessCount(
  state: Pick<ImportStore, "results">,
): number {
  return state.results.filter((r) => r.success && !r.placeholder).length;
}

/**
 * Selector: count of placeholder feeds added by import (initial fetch
 * failed but the row was persisted for later retry via refresh).
 */
export function selectPlaceholderCount(
  state: Pick<ImportStore, "results">,
): number {
  return state.results.filter((r) => r.success && r.placeholder).length;
}

/** Selector: count of rejected imports (parse / discovery / duplicate). */
export function selectFailureCount(
  state: Pick<ImportStore, "results">,
): number {
  return state.results.filter((r) => !r.success).length;
}

/** Selector: current URL being processed */
export function selectCurrentUrl(
  state: Pick<ImportStore, "status" | "urls" | "currentIndex">,
): string | null {
  if (state.status !== "importing" || state.currentIndex >= state.urls.length) {
    return null;
  }
  return state.urls[state.currentIndex];
}
