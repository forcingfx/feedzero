/**
 * Boot finite state machine — the single source of truth for the app's
 * pre-mount lifecycle.
 *
 * Before this module existed, the boot status was modelled by five
 * loosely-coupled fields on app-store (`isDbReady`, `error`,
 * `recoveryMode`, `securityProblem`, `hasCompletedOnboarding`) plus
 * a module-level `initReturningUserInFlight` Promise guard. Most
 * 2^5 = 32 combinations were impossible but representable;
 * `AppInit` had three cascading useEffects coordinating who could fire
 * when. The 2026-05 mobile-SPA bug landed in exactly that gap.
 *
 * The reducer here is pure — no React, no async, no I/O. Every
 * transition is exhaustively asserted in `boot-fsm.test.ts`.
 * Impossible states (e.g. "ready and security-blocked at once") are
 * structurally prevented by the discriminated union.
 *
 * Side effects (restore, dedupe migration, prefs hydrate, background
 * pull, refresh-all) are driven by a separate runner that observes
 * state transitions — see `app-store.ts` and `AppInit` in `app.tsx`.
 */

import type { SyncCredentials } from "@/core/sync/sync-service";
import type { SecureContextProblemKind } from "@/core/security/secure-context";

/**
 * The browser environment isn't safe to run FeedZero in. Surfaced
 * when the secure-context check fails during new-user boot.
 */
export interface SecurityProblem {
  kind: SecureContextProblemKind;
  message: string;
  origin?: string;
}

/**
 * The full set of boot lifecycle states. The state machine never sits
 * outside one of these — every meaningful (isDbReady, error,
 * recoveryMode, ...) combination collapses to one of these kinds.
 */
export type BootState =
  | { kind: "unknown" }
  | { kind: "checking-onboarding" }
  | { kind: "needs-onboarding" }
  | { kind: "restoring" }
  | {
      kind: "hydrating";
      isSyncUser: boolean;
      credentials: SyncCredentials | null;
    }
  | { kind: "ready" }
  | { kind: "needs-recovery" }
  | { kind: "security-blocked"; problem: SecurityProblem }
  | { kind: "error"; message: string };

/**
 * Every external signal the FSM can react to. The reducer is
 * exhaustive on `event.type` so adding an event without handling it
 * trips a TypeScript error.
 */
export type BootEvent =
  | { type: "boot" }
  | { type: "onboarding-checked"; hasCompleted: boolean }
  | {
      type: "restore-succeeded";
      isSyncUser: boolean;
      credentials: SyncCredentials | null;
    }
  | { type: "restore-no-keys" }
  | { type: "restore-invalid-keys" }
  | { type: "hydration-completed" }
  | { type: "initialize-completed" }
  | { type: "security-problem-detected"; problem: SecurityProblem }
  | { type: "init-error"; message: string }
  | { type: "reset" }
  | { type: "recovery-cleared" };

/**
 * Pure transition function. Unknown (state, event) pairs are no-ops —
 * intentional defensive design so that double-dispatch from React
 * StrictMode or stale effects can't corrupt the state.
 *
 * Note: `init-error` is the one event that's accepted in nearly every
 * state — an async failure can land at any point during boot. The
 * `reset` event is accepted from any state and re-enters `unknown`
 * so the runner can replay the whole sequence after a manual reset.
 */
export function bootReducer(state: BootState, event: BootEvent): BootState {
  // Universal transitions — accepted regardless of current state. The
  // environment can become unsafe at any point (e.g. user revoked the
  // secure context after boot started), and async failures can land
  // mid-flight; both move the FSM to a terminal state immediately.
  if (event.type === "reset") return { kind: "unknown" };
  if (event.type === "init-error") {
    return { kind: "error", message: event.message };
  }
  if (event.type === "security-problem-detected") {
    return { kind: "security-blocked", problem: event.problem };
  }

  switch (state.kind) {
    case "unknown":
      if (event.type === "boot") return { kind: "checking-onboarding" };
      return state;

    case "checking-onboarding":
      if (event.type === "onboarding-checked") {
        return event.hasCompleted
          ? { kind: "restoring" }
          : { kind: "needs-onboarding" };
      }
      return state;

    case "needs-onboarding":
      if (event.type === "initialize-completed") return { kind: "ready" };
      return state;

    case "restoring":
      if (event.type === "restore-succeeded") {
        return {
          kind: "hydrating",
          isSyncUser: event.isSyncUser,
          credentials: event.credentials,
        };
      }
      if (event.type === "restore-no-keys") return { kind: "needs-onboarding" };
      if (event.type === "restore-invalid-keys") {
        return { kind: "needs-recovery" };
      }
      return state;

    case "hydrating":
      if (event.type === "hydration-completed") return { kind: "ready" };
      return state;

    case "needs-recovery":
      // The user's recovery action (switchToExistingCloud) has already
      // re-created and opened the local DB by the time this event fires —
      // it's the InvalidKeysScreen's success continuation. We're done
      // booting; jump straight to ready.
      if (event.type === "recovery-cleared") return { kind: "ready" };
      return state;

    case "ready":
    case "security-blocked":
    case "error":
      // Terminal until explicit reset. Ignore everything else so that
      // a stray dispatch from a StrictMode re-render or a background
      // promise resolving after a state change can't kick the app
      // backwards.
      return state;
  }
}
