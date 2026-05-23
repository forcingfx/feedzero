import { create } from "zustand";
import {
  initFresh,
  restore,
  destroy,
} from "../core/storage/key-manager.ts";
import { dedupeArticles } from "../core/storage/db.ts";
import { BOOT_PULL_TIMEOUT_MS, LOCAL_STORAGE } from "@feedzero/core/utils/constants";
import { useSyncStore } from "./sync-store.ts";
import { usePreferencesStore } from "./preferences-store.ts";
import { persistPreferences } from "./persist-preferences.ts";
import { useFeedStore } from "./feed-store.ts";
import { useArticleStore } from "./article-store.ts";
import { useOnboardingStore } from "./onboarding-store.ts";
import { DEFAULT_PREFERENCES } from "@feedzero/core/types";
import { generatePassphrase } from "../core/crypto/passphrase-generator.ts";
import {
  checkSecureContext,
  type SecureContextProblemKind,
} from "../core/security/secure-context.ts";

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

/**
 * The browser environment isn't safe to run FeedZero in. Surfaced
 * when {@link AppStore.startNewUserOnboarding} discovers the page
 * was loaded without a secure context or without `crypto.subtle`.
 * AppInit renders an explanatory screen in this state.
 */
export type SecurityProblem = {
  kind: SecureContextProblemKind;
  message: string;
  origin?: string;
};

interface AppStore {
  isDbReady: boolean;
  error: string | null;
  hasCompletedOnboarding: boolean | null;
  /** Non-null when the user must take explicit action to recover. */
  recoveryMode: RecoveryMode | null;
  /** Non-null when the browser environment is incompatible. */
  securityProblem: SecurityProblem | null;
  /** When true, the article list collapses same-feed flood runs into stacks. */
  groupArticleFloods: boolean;
  /** Initialize a fresh DB for new users (onboarding). */
  initialize: (passphrase: string, options?: { sync: boolean }) => Promise<void>;
  /** Restore DB for returning users from stored keys. */
  initializeReturningUser: () => Promise<void>;
  /**
   * The full new-user boot sequence: secure-context check, generate
   * passphrase, init a fresh DB, mark onboarding complete. AppInit
   * fires this once when it detects a never-onboarded user. Failures
   * set either `securityProblem` (environment) or `error` (init).
   */
  startNewUserOnboarding: () => Promise<void>;
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

/**
 * One-time sweep that removes duplicate article rows left behind by the
 * pre-fix concurrent-refresh race. Gated by a localStorage flag so it runs
 * at most once per browser; the flag is only set on success, so a transient
 * failure retries next boot. Refresh stays self-healing for future
 * stragglers (see `dedupeArticles` in feed-service), so this is purely the
 * immediate, network-independent cleanup of data that already landed.
 */
async function runDedupeMigrationOnce(): Promise<void> {
  try {
    if (localStorage.getItem(LOCAL_STORAGE.DEDUPE_MIGRATION) === "done") return;
    const result = await dedupeArticles();
    if (result.ok) {
      localStorage.setItem(LOCAL_STORAGE.DEDUPE_MIGRATION, "done");
    }
  } catch {
    // Best-effort cleanup — never block boot on it.
  }
}

/**
 * Race the sync pull against a watchdog. Resolves either when the pull
 * settles or when `BOOT_PULL_TIMEOUT_MS` elapses, whichever comes first.
 * Returning early on timeout lets boot proceed with the local DB; the
 * pull stays in-flight in the background and `useSyncStore.pull()`'s
 * own `inFlightPull` dedup means a downstream `refreshAll()` will await
 * the same promise rather than firing a second pull.
 *
 * Background completion triggers a `loadFeeds` so the sidebar reflects
 * any data the pull eventually imported. Only fires when the pull
 * actually finishes — if it never does, the background side stays a
 * pending promise (which the runtime GCs on tab close).
 */
async function pullWithBootWatchdog(): Promise<void> {
  const pull = useSyncStore.getState().pull();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), BOOT_PULL_TIMEOUT_MS);
  });
  const outcome = await Promise.race([pull.then(() => "settled" as const), watchdog]);
  if (timer !== undefined) clearTimeout(timer);
  if (outcome === "timeout") {
    // Best-effort: if the pull eventually completes after we've given up
    // on it, refresh the in-memory feed list so the UI catches up to the
    // imported vault. Failures are ignored — the user can manually
    // refresh if needed.
    void pull
      .then(async () => {
        await useFeedStore.getState().loadFeeds();
      })
      .catch(() => {
        /* noop — pull's own error handling already set sync status */
      });
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

export const useAppStore = create<AppStore>((set, get) => ({
  isDbReady: false,
  error: null,
  hasCompletedOnboarding: null,
  recoveryMode: null,
  securityProblem: null,
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

    // Fresh DB: seeds the default preferences row (no legacy keys to
    // migrate) so the first push carries a preferences payload.
    await usePreferencesStore.getState().hydrate();

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
      //
      // BUT: a pull that never settles must not trap the user on the
      // "Loading…" splash. Race against a watchdog timer — on timeout we
      // proceed with the (canary-validated) local DB; the pull stays
      // in-flight and an eventual `loadFeeds` picks up its result if it
      // ever lands. Boot-blocks-on-network was the production hang
      // reported here.
      if (status.isSyncUser) {
        await pullWithBootWatchdog();
        if (useSyncStore.getState().status !== "error") {
          useSyncStore.setState({ status: "synced", lastSyncedAt: Date.now() });
        }
      }

      await runDedupeMigrationOnce();

      // Load synced preferences (or migrate legacy localStorage keys) and
      // push them into the consumer stores BEFORE the UI mounts on
      // isDbReady — otherwise the sidebar flashes default ordering/sort.
      await usePreferencesStore.getState().hydrate();

      set({ isDbReady: true, error: null });
    })().finally(() => {
      initReturningUserInFlight = null;
    });

    return initReturningUserInFlight;
  },

  startNewUserOnboarding: async () => {
    const check = checkSecureContext({
      isSecureContext: globalThis.isSecureContext ?? false,
      crypto: globalThis.crypto as Pick<Crypto, "subtle"> | undefined,
      origin:
        typeof window !== "undefined" ? window.location.origin : undefined,
    });
    if (!check.ok) {
      set({
        securityProblem: {
          kind: check.kind,
          message: check.error,
          origin: check.origin,
        },
      });
      return;
    }
    try {
      const passphrase = await generatePassphrase();
      await get().initialize(passphrase, { sync: false });
      // initialize() reports failures by setting `error` on the store
      // without throwing. Don't mark onboarding complete in that case —
      // the user needs to see the error and retry, not be promoted to
      // a returning user with a half-initialized DB.
      if (!get().error) get().completeOnboarding();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Initialization failed" });
    }
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
    set({ groupArticleFloods: next });
    persistPreferences({ groupArticleFloods: next });
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
    resetAllStores();
  },
}));

/**
 * Reset all stores to initial state. Called by sync-store.logout()
 * to avoid cross-store knowledge in individual stores.
 */
export function resetAllStores(): void {
  useAppStore.setState({ isDbReady: false, hasCompletedOnboarding: false });
  useFeedStore.setState({ feeds: [], selectedFeedId: null });
  useArticleStore.setState({ articles: [], selectedArticle: null });
  // Clear the hydrate guard so a re-onboarded user re-loads preferences
  // from their fresh DB rather than keeping the previous session's values.
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    hydrated: false,
  });
  useOnboardingStore.getState().reset();
}
