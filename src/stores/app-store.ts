import { create } from "zustand";
import {
  initFresh,
  restore,
  destroy,
} from "../core/storage/key-manager.ts";
import { LOCAL_STORAGE } from "../utils/constants.ts";
import { useSyncStore } from "./sync-store.ts";

/**
 * Recoverable boot-time failure modes that require explicit user
 * action. Set on the store when {@link restore} returns non-`ready`.
 *
 * - `invalid-keys`: stored keys exist but cannot decrypt local data.
 *   The cloud vault is untouched; the user picks "Restore from cloud"
 *   (re-enter passphrase, pull) or "Wipe and start over" (explicit
 *   confirmation, runs `resetApp` which is the only legitimate caller
 *   of the destructive `destroy()` cascade).
 *
 * Prior behavior auto-called `destroy()` here, deleting both the local
 * DB and the server-side vault — catastrophic data loss masked as
 * "sync didn't work." See issue #117.
 */
export type RecoveryMode = "invalid-keys";

interface AppStore {
  isDbReady: boolean;
  error: string | null;
  hasCompletedOnboarding: boolean | null;
  /** Non-null when the user must take explicit action to recover. */
  recoveryMode: RecoveryMode | null;
  /** When true, the article list collapses same-feed flood runs into stacks. */
  groupArticleFloods: boolean;
  /** Initialize a fresh DB for new users (onboarding). */
  initialize: (passphrase: string, options?: { sync: boolean }) => Promise<void>;
  /** Restore DB for returning users from stored keys. */
  initializeReturningUser: () => Promise<void>;
  setError: (error: string | null) => void;
  /** Clear the recovery prompt (e.g. after the user picks an action). */
  clearRecoveryMode: () => void;
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
// call's restore() can race the first call's pull(), and the canary
// check could spuriously fail. The auto-destroy cascade that this used
// to trigger has been removed — see initializeReturningUser below — so
// the worst-case is now a user-visible recovery prompt, not silent data
// loss. The dedup is still useful to avoid double-pulling the vault.
let initReturningUserInFlight: Promise<void> | null = null;

export const useAppStore = create<AppStore>((set) => ({
  isDbReady: false,
  error: null,
  hasCompletedOnboarding: null,
  recoveryMode: null,
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

      if (status.status === "no-keys") {
        // No stored keys — user needs to re-onboard. Nothing to
        // destroy locally, and we MUST NOT issue a server-vault
        // DELETE: we have no vault credentials in memory anyway, but
        // the structural rule is "boot-time recovery never deletes".
        set({
          isDbReady: false,
          error: null,
          hasCompletedOnboarding: false,
          recoveryMode: null,
        });
        return;
      }

      if (status.status === "invalid-keys") {
        // Stored keys can't decrypt local data. The cloud vault is
        // not necessarily corrupt — could be a transient browser
        // glitch, an interrupted migration, or genuinely corrupted
        // local state. Either way, deletion is the USER's call.
        // Surface a recovery prompt and let them choose:
        //   - "Restore from cloud" (passphrase → switchToExistingCloud)
        //   - "Wipe and start over" (explicit resetApp confirmation)
        // Issue #117: replacing the previous auto-destroy cascade.
        set({
          isDbReady: false,
          error: null,
          recoveryMode: "invalid-keys",
        });
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

  clearRecoveryMode: () => set({ recoveryMode: null }),

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
    // The ONLY legitimate caller of destroy() — must be invoked from
    // an explicit user-confirmed UI action (settings reset button or
    // the invalid-keys recovery screen's "Wipe and start over"). Any
    // automatic / boot-time use of destroy() is a bug — see issue #117.
    await destroy();
    set({
      isDbReady: false,
      error: null,
      hasCompletedOnboarding: false,
      recoveryMode: null,
    });
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
