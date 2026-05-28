import { create } from "zustand";
import {
  initFresh,
  restore,
  destroy,
} from "../core/storage/key-manager.ts";
import { dedupeArticles } from "../core/storage/db.ts";
import { LOCAL_STORAGE } from "@feedzero/core/utils/constants";
import { useSyncStore } from "./sync-store.ts";
import { usePreferencesStore } from "./preferences-store.ts";
import { persistPreferences } from "./persist-preferences.ts";
import { useFeedStore } from "./feed-store.ts";
import { useArticleStore } from "./article-store.ts";
import { useOnboardingStore } from "./onboarding-store.ts";
import { DEFAULT_PREFERENCES } from "@feedzero/core/types";
import {
  checkSecureContext,
} from "../core/security/secure-context.ts";
import {
  bootReducer,
  type BootState,
  type BootEvent,
  type SecurityProblem,
} from "./boot-fsm.ts";

export type { SecurityProblem } from "./boot-fsm.ts";

/**
 * Recoverable boot-time failure modes that require explicit user
 * action. Set when the FSM transitions to `needs-recovery`.
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
  /**
   * The canonical boot lifecycle state. All boot-time UI routing
   * decisions read from here. The fields below
   * (`isDbReady` / `error` / `recoveryMode` / `securityProblem` /
   * `hasCompletedOnboarding`) are kept in sync as derived mirrors so
   * existing consumers can migrate to the FSM at their own pace.
   */
  bootState: BootState;
  /**
   * Dispatch an event into the boot FSM. Pure-function transition;
   * unknown (state, event) pairs are silent no-ops (defensive against
   * React StrictMode double-dispatch and stale background promises).
   *
   * Async-returning so callers can `await` the entire chain of follow-on
   * dispatches the side-effect runner produces — tests use this to
   * wait for the FSM to reach a terminal state without polling.
   */
  dispatch: (event: BootEvent) => Promise<void>;

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
  /**
   * Returning-user boot. Now a thin wrapper that fires `boot` into the
   * FSM — the FSM's side-effect runner does the actual work. Kept on
   * the store for backward compat with tests; new call sites should
   * use `dispatch({ type: "boot" })`.
   */
  initializeReturningUser: () => Promise<void>;
  /**
   * The full new-user boot sequence. Same shape as before: secure
   * context → passphrase → initialize → completeOnboarding. Each step
   * dispatches the corresponding FSM event so the canonical state
   * stays in sync.
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
 * pre-fix concurrent-refresh race. Gated by a localStorage flag so it
 * runs at most once per browser; the flag is only set on success.
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
 * Kick off the sync pull in the background and reconcile the in-memory
 * feed list when it lands. Boot does NOT await this — `useSyncStore.pull()`'s
 * `inFlightPull` dedup means the `refreshAll` that AppInit fires shortly
 * after `ready` will await this exact promise rather than racing a
 * second pull (see `tests/e2e/sync-100-feeds.spec.ts`).
 */
function pullInBackground(): void {
  void useSyncStore
    .getState()
    .pull()
    .then(async () => {
      await useFeedStore.getState().loadFeeds();
    })
    .catch(() => {
      /* noop — pull's own error handling already set sync status */
    });
}

/**
 * Project the FSM state down to the legacy boolean/enum fields so
 * existing consumers (`useAppStore(s => s.isDbReady)`, etc.) keep
 * working unchanged. The FSM is the canonical; this mirror is
 * write-only from the FSM's perspective.
 */
function applyBootState(state: BootState): Partial<AppStore> {
  return {
    bootState: state,
    isDbReady: state.kind === "ready",
    error: state.kind === "error" ? state.message : null,
    recoveryMode: state.kind === "needs-recovery" ? "invalid-keys" : null,
    securityProblem:
      state.kind === "security-blocked" ? state.problem : null,
    hasCompletedOnboarding: hasCompletedOnboardingFor(state),
  };
}

/**
 * Legacy `hasCompletedOnboarding` mirror — null means "we don't know
 * yet", false means "user has explicitly not onboarded", true means
 * "user has previously onboarded and is past the welcome flow".
 * Terminal failure states (error / security-blocked) say null because
 * we can't know from the failure alone whether onboarding had completed.
 */
function hasCompletedOnboardingFor(state: BootState): boolean | null {
  switch (state.kind) {
    case "unknown":
    case "checking-onboarding":
    case "error":
    case "security-blocked":
      return null;
    case "needs-onboarding":
      return false;
    case "restoring":
    case "hydrating":
    case "ready":
    case "needs-recovery":
      return true;
  }
}

/**
 * Side-effect runner — fires async work as the FSM enters each state.
 * Single switch instead of a cascade of useEffects in AppInit. The
 * runner is intentionally fire-and-forget per state entry; results
 * land back as `dispatch(event)` calls that move the FSM forward.
 *
 * Idempotency: each call advances the FSM if (and only if) the
 * `dispatch` arg is honored by the reducer. Stale dispatches from a
 * previous boot attempt are no-ops in the new state.
 */
async function runBootSideEffects(
  state: BootState,
  dispatch: (event: BootEvent) => Promise<void>,
): Promise<void> {
  switch (state.kind) {
    case "checking-onboarding": {
      const completed =
        localStorage.getItem(LOCAL_STORAGE.ONBOARDING_COMPLETE) === "true";
      await dispatch({ type: "onboarding-checked", hasCompleted: completed });
      return;
    }

    case "restoring": {
      const status = await restore();
      if (status.status === "no-keys") {
        await dispatch({ type: "restore-no-keys" });
        return;
      }
      if (status.status === "invalid-keys") {
        await dispatch({ type: "restore-invalid-keys" });
        return;
      }
      if (status.credentials) {
        useSyncStore.setState({ credentials: status.credentials });
      }
      await dispatch({
        type: "restore-succeeded",
        isSyncUser: status.isSyncUser,
        credentials: status.credentials,
      });
      return;
    }

    case "hydrating": {
      if (state.isSyncUser) {
        useSyncStore.setState({ status: "syncing" });
        pullInBackground();
      }
      await runDedupeMigrationOnce();
      await usePreferencesStore.getState().hydrate();
      await dispatch({ type: "hydration-completed" });
      return;
    }

    // ready / needs-onboarding / needs-recovery / security-blocked /
    // error / unknown: no boot-driven side effect. Post-ready work
    // (loadFeeds + preloadArticles + refreshAll) is owned by AppInit
    // because it depends on React-mounted hooks that watch the result.
    default:
      return;
  }
}

export const useAppStore = create<AppStore>((set, get) => {
  /** Single chokepoint for FSM transitions + their side effects. */
  const dispatch = async (event: BootEvent): Promise<void> => {
    const prev = get().bootState;
    const next = bootReducer(prev, event);
    if (next === prev) return; // no-op transition; skip side effects
    set(applyBootState(next));
    await runBootSideEffects(next, dispatch);
  };

  return {
    bootState: { kind: "unknown" },
    dispatch,

    isDbReady: false,
    error: null,
    hasCompletedOnboarding: null,
    recoveryMode: null,
    securityProblem: null,
    groupArticleFloods: readGroupArticleFloods(),

    initialize: async (passphrase, options) => {
      // `initialize` is the new-user finalization path (onboarding modal
      // and the auto onboarding action both call it). Place the FSM in
      // `needs-onboarding` so the `initialize-completed` dispatch below
      // is accepted regardless of how we got here.
      if (get().bootState.kind !== "needs-onboarding") {
        set(applyBootState({ kind: "needs-onboarding" }));
      }
      const result = await initFresh(passphrase, options);
      if (!result.ok) {
        await dispatch({ type: "init-error", message: result.error });
        return;
      }

      if (result.value.credentials) {
        useSyncStore.setState({ credentials: result.value.credentials });
      }

      // Fresh DB: seeds the default preferences row (no legacy keys to
      // migrate) so the first push carries a preferences payload.
      await usePreferencesStore.getState().hydrate();

      await dispatch({ type: "initialize-completed" });
    },

    initializeReturningUser: async () => {
      // Returning-user entry point. Skips `checking-onboarding` —
      // the caller has already determined this is a returning user.
      // Idempotent against React StrictMode double-dispatch: if a
      // restoring/hydrating/ready state is already in flight, jumping
      // back to `restoring` is a deliberate reset of the boot
      // sequence (e.g. after `recoveryCleared`).
      set(applyBootState({ kind: "restoring" }));
      await runBootSideEffects(get().bootState, dispatch);
    },

    startNewUserOnboarding: async () => {
      // New-user entry point. Job: secure-context guard, then hand off
      // to the OnboardingModal by parking the FSM in `needs-onboarding`.
      //
      // Previously this action ALSO auto-generated a passphrase,
      // initialized a local-only DB, and marked onboarding complete —
      // which meant the modal never actually appeared. Every new user
      // landed in local-only mode with a passphrase they never saw,
      // unable to later enable sync from the same passphrase, and with
      // no recovery story if their browser data got cleared.
      //
      // The modal (mounted at App() top level) owns the welcome →
      // storage-choice → passphrase-display → confirm flow and calls
      // initialize() itself once the user has made an explicit choice.
      const check = checkSecureContext({
        isSecureContext: globalThis.isSecureContext ?? false,
        crypto: globalThis.crypto as Pick<Crypto, "subtle"> | undefined,
        origin:
          typeof window !== "undefined" ? window.location.origin : undefined,
      });
      if (!check.ok) {
        await dispatch({
          type: "security-problem-detected",
          problem: {
            kind: check.kind,
            message: check.error,
            origin: check.origin,
          },
        });
        return;
      }
      // Land the FSM in needs-onboarding so the modal renders. The
      // modal's chooseStorageMode → initialize() call drives the FSM
      // forward to ready via `initialize-completed`.
      if (get().bootState.kind !== "needs-onboarding") {
        set(applyBootState({ kind: "needs-onboarding" }));
      }
    },

    setError: (error) => {
      if (error === null) {
        // Backward-compat: callers clear `error` to dismiss the boot
        // error banner; route through the FSM via reset so a re-attempt
        // can fire `boot` cleanly.
        void dispatch({ type: "reset" });
        return;
      }
      void dispatch({ type: "init-error", message: error });
    },

    clearRecoveryMode: () => {
      void dispatch({ type: "recovery-cleared" });
    },

    completeOnboarding: () => {
      localStorage.setItem(LOCAL_STORAGE.ONBOARDING_COMPLETE, "true");
      // Onboarding-modal calls completeOnboarding directly after its own
      // initialize() — drive the FSM through needs-onboarding to ready
      // so the canonical state catches up regardless of where it was.
      if (get().bootState.kind !== "ready") {
        set(applyBootState({ kind: "needs-onboarding" }));
        void dispatch({ type: "initialize-completed" });
      }
    },

    checkOnboardingStatus: () => {
      // Backward-compat shim. The historical contract was a synchronous
      // localStorage read that only updated `hasCompletedOnboarding`,
      // so consumers (AppInit, tests) don't expect any async chain or
      // FSM transition to fire. Mirror that exactly: read the flag,
      // update the legacy field, leave bootState alone.
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
      await dispatch({ type: "reset" });
      set({ hasCompletedOnboarding: false });
      resetAllStores();
    },
  };
});

/**
 * Reset all stores to initial state. Called by sync-store.logout()
 * to avoid cross-store knowledge in individual stores.
 */
export function resetAllStores(): void {
  useAppStore.setState({
    bootState: { kind: "unknown" },
    isDbReady: false,
    hasCompletedOnboarding: false,
  });
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
