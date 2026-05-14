import { create } from "zustand";
import {
  initFresh,
  restore,
  destroy,
} from "../core/storage/key-manager.ts";
import { LOCAL_STORAGE } from "../utils/constants.ts";
import { useSyncStore } from "./sync-store.ts";

interface AppStore {
  isDbReady: boolean;
  error: string | null;
  hasCompletedOnboarding: boolean | null;
  /** When true, the article list collapses same-feed flood runs into stacks. */
  groupArticleFloods: boolean;
  /** Initialize a fresh DB for new users (onboarding). */
  initialize: (passphrase: string, options?: { sync: boolean }) => Promise<void>;
  /** Restore DB for returning users from stored keys. */
  initializeReturningUser: () => Promise<void>;
  setError: (error: string | null) => void;
  completeOnboarding: () => void;
  checkOnboardingStatus: () => void;
  setGroupArticleFloods: (next: boolean) => void;
  resetApp: () => Promise<void>;
}

/**
 * Default-on: only an explicit "false" disables the feature. Any other
 * value (missing key, parse failure, "true") falls through to true so
 * a fresh browser opts users into the better default UX.
 */
function readGroupArticleFloods(): boolean {
  try {
    return localStorage.getItem(LOCAL_STORAGE.GROUP_ARTICLE_FLOODS) !== "false";
  } catch {
    return true;
  }
}

// Dedup concurrent boot-time calls. AppInit's effect 1 fires twice in
// React StrictMode (dev), and could plausibly fire from a remount in
// other contexts (fast refresh, suspense). Without this guard, a second
// call's restore() can race the first call's pull(); if the canary check
// fails, the second call runs destroy() — which deletes both IndexedDB
// AND the server vault. Catastrophic data loss masked as a "sync didn't
// work" symptom. Reproducer: tests/e2e/sync-100-feeds.spec.ts.
let initReturningUserInFlight: Promise<void> | null = null;

export const useAppStore = create<AppStore>((set) => ({
  isDbReady: false,
  error: null,
  hasCompletedOnboarding: null,
  groupArticleFloods: readGroupArticleFloods(),

  initialize: async (passphrase, options) => {
    const result = await initFresh(passphrase, options);
    if (!result.ok) {
      set({ isDbReady: false, error: result.error });
      return;
    }

    if (result.value.credentials) {
      useSyncStore.setState({ credentials: result.value.credentials });
    }

    set({ isDbReady: true, error: null });
  },

  initializeReturningUser: async () => {
    if (initReturningUserInFlight) return initReturningUserInFlight;

    initReturningUserInFlight = (async () => {
      const status = await restore();

      if (status.status !== "ready") {
        // Keys missing or invalid — clean slate, re-onboard
        await destroy();
        set({ isDbReady: false, error: null, hasCompletedOnboarding: false });
        return;
      }

      if (status.credentials) {
        useSyncStore.setState({ credentials: status.credentials });
      }

      // For sync users, finish the initial pull BEFORE flipping isDbReady.
      // AppInit's `isDbReady` effect kicks off loadFeeds + refreshAll the
      // moment the flag goes true; if we set it before the pull settles,
      // refreshAll's own pull() races with this one and importAll's
      // clear+bulkPut sequences interleave, leaving a window where feeds
      // appear absent. See tests/e2e/sync-100-feeds.spec.ts for the
      // reproducer.
      if (status.isSyncUser) {
        await useSyncStore.getState().pull();
        if (useSyncStore.getState().status !== "error") {
          useSyncStore.setState({ status: "synced", lastSyncedAt: Date.now() });
        }
      }

      set({ isDbReady: true, error: null });
    })().finally(() => {
      initReturningUserInFlight = null;
    });

    return initReturningUserInFlight;
  },

  setError: (error) => set({ error }),

  completeOnboarding: () => {
    localStorage.setItem(LOCAL_STORAGE.ONBOARDING_COMPLETE, "true");
    set({ hasCompletedOnboarding: true });
  },

  checkOnboardingStatus: () => {
    const completed =
      localStorage.getItem(LOCAL_STORAGE.ONBOARDING_COMPLETE) === "true";
    set({ hasCompletedOnboarding: completed });
  },

  setGroupArticleFloods: (next) => {
    try {
      localStorage.setItem(LOCAL_STORAGE.GROUP_ARTICLE_FLOODS, String(next));
    } catch {
      /* ignore — fall back to in-memory state only */
    }
    set({ groupArticleFloods: next });
  },

  resetApp: async () => {
    await destroy();
    set({ isDbReady: false, error: null, hasCompletedOnboarding: false });
    await resetAllStores();
  },
}));

/**
 * Reset all stores to initial state. Called by sync-store.logout()
 * to avoid cross-store knowledge in individual stores.
 */
export async function resetAllStores(): Promise<void> {
  const { useFeedStore } = await import("./feed-store.ts");
  const { useArticleStore } = await import("./article-store.ts");
  const { useOnboardingStore } = await import("./onboarding-store.ts");
  useAppStore.setState({ isDbReady: false, hasCompletedOnboarding: false });
  useFeedStore.setState({ feeds: [], selectedFeedId: null });
  useArticleStore.setState({ articles: [], selectedArticle: null });
  useOnboardingStore.getState().reset();
}
