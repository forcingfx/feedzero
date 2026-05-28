/**
 * Boot FSM — pure (state, event) → state reducer that models the
 * returning-user / new-user / recovery / security-blocked paths the
 * app cycles through before mounting. Every legitimate combination of
 * the previously-scattered booleans (isDbReady, error, recoveryMode,
 * securityProblem, hasCompletedOnboarding) collapses to one of the
 * states below.
 *
 * The reducer is pure — React-free, async-free — so every transition
 * can be exhaustively asserted here without test wiring.
 */
import { describe, it, expect } from "vitest";
import { bootReducer, type BootState, type BootEvent } from "@/stores/boot-fsm";

const initial: BootState = { kind: "unknown" };

function reduce(events: BootEvent[]): BootState {
  return events.reduce(
    (s, e) => bootReducer(s, e),
    initial as BootState,
  );
}

describe("bootReducer", () => {
  it("starts in 'unknown'", () => {
    expect(initial.kind).toBe("unknown");
  });

  it("'boot' moves to 'checking-onboarding'", () => {
    expect(bootReducer(initial, { type: "boot" }).kind).toBe(
      "checking-onboarding",
    );
  });

  describe("returning-user path", () => {
    it("checking-onboarding + completed → restoring", () => {
      const s = reduce([
        { type: "boot" },
        { type: "onboarding-checked", hasCompleted: true },
      ]);
      expect(s.kind).toBe("restoring");
    });

    it("restoring + restore-succeeded (sync user) → hydrating", () => {
      const s = reduce([
        { type: "boot" },
        { type: "onboarding-checked", hasCompleted: true },
        {
          type: "restore-succeeded",
          isSyncUser: true,
          credentials: { vaultId: "v" } as never,
        },
      ]);
      expect(s.kind).toBe("hydrating");
      if (s.kind === "hydrating") {
        expect(s.isSyncUser).toBe(true);
        expect(s.credentials).not.toBeNull();
      }
    });

    it("restoring + restore-succeeded (local user) → hydrating with isSyncUser=false", () => {
      const s = reduce([
        { type: "boot" },
        { type: "onboarding-checked", hasCompleted: true },
        {
          type: "restore-succeeded",
          isSyncUser: false,
          credentials: null,
        },
      ]);
      expect(s.kind).toBe("hydrating");
      if (s.kind === "hydrating") {
        expect(s.isSyncUser).toBe(false);
        expect(s.credentials).toBeNull();
      }
    });

    it("hydrating + hydration-completed → ready", () => {
      const s = reduce([
        { type: "boot" },
        { type: "onboarding-checked", hasCompleted: true },
        { type: "restore-succeeded", isSyncUser: false, credentials: null },
        { type: "hydration-completed" },
      ]);
      expect(s.kind).toBe("ready");
    });
  });

  describe("recovery paths", () => {
    it("restoring + restore-no-keys → needs-onboarding (user must re-onboard)", () => {
      // Stored keys disappeared (cleared browser data, switched profiles,
      // private browsing tab). The user can complete onboarding fresh;
      // no destructive action.
      const s = reduce([
        { type: "boot" },
        { type: "onboarding-checked", hasCompleted: true },
        { type: "restore-no-keys" },
      ]);
      expect(s.kind).toBe("needs-onboarding");
    });

    it("restoring + restore-invalid-keys → needs-recovery (user picks action)", () => {
      // Issue #117: stored keys exist but can't decrypt local data.
      // The cloud vault is NOT necessarily corrupt; the user explicitly
      // chooses restore-from-cloud or wipe-and-start-over.
      const s = reduce([
        { type: "boot" },
        { type: "onboarding-checked", hasCompleted: true },
        { type: "restore-invalid-keys" },
      ]);
      expect(s.kind).toBe("needs-recovery");
    });

    it("needs-recovery + recovery-cleared → ready (user has already restored via switchToExistingCloud)", () => {
      // The InvalidKeysScreen calls switchToExistingCloud (which opens
      // the new DB) BEFORE dispatching recovery-cleared. By the time the
      // FSM sees this event, the DB is ready — we're past boot. Going
      // back through `restoring` would re-fire side effects on an
      // already-open DB and risk the auto-destroy class (issue #117).
      const s = reduce([
        { type: "boot" },
        { type: "onboarding-checked", hasCompleted: true },
        { type: "restore-invalid-keys" },
        { type: "recovery-cleared" },
      ]);
      expect(s.kind).toBe("ready");
    });
  });

  describe("new-user path", () => {
    it("checking-onboarding + not-completed → needs-onboarding", () => {
      const s = reduce([
        { type: "boot" },
        { type: "onboarding-checked", hasCompleted: false },
      ]);
      expect(s.kind).toBe("needs-onboarding");
    });

    it("needs-onboarding + initialize-completed → ready", () => {
      const s = reduce([
        { type: "boot" },
        { type: "onboarding-checked", hasCompleted: false },
        { type: "initialize-completed" },
      ]);
      expect(s.kind).toBe("ready");
    });

    it("needs-onboarding + security-problem-detected → security-blocked", () => {
      const s = reduce([
        { type: "boot" },
        { type: "onboarding-checked", hasCompleted: false },
        {
          type: "security-problem-detected",
          problem: {
            kind: "insecure-context",
            message: "x",
          },
        },
      ]);
      expect(s.kind).toBe("security-blocked");
    });
  });

  describe("error path", () => {
    it("any state + init-error → error", () => {
      const s = reduce([
        { type: "boot" },
        { type: "onboarding-checked", hasCompleted: true },
        { type: "init-error", message: "DB failed" },
      ]);
      expect(s.kind).toBe("error");
      if (s.kind === "error") expect(s.message).toBe("DB failed");
    });

    it("error + reset → unknown (re-enters boot from scratch)", () => {
      const s = reduce([
        { type: "boot" },
        { type: "init-error", message: "DB failed" },
        { type: "reset" },
      ]);
      expect(s.kind).toBe("unknown");
    });
  });

  describe("impossible transitions are no-ops (defensive)", () => {
    it("ready + boot stays ready — re-booting an already-ready app is a no-op", () => {
      // Prevents the "React StrictMode fires the effect twice" double-dispatch
      // class of bug — once we're ready, we don't restart.
      const s = reduce([
        { type: "boot" },
        { type: "onboarding-checked", hasCompleted: true },
        { type: "restore-succeeded", isSyncUser: false, credentials: null },
        { type: "hydration-completed" },
        { type: "boot" },
      ]);
      expect(s.kind).toBe("ready");
    });

    it("security-blocked is terminal — events other than 'reset' are ignored", () => {
      const s = reduce([
        { type: "boot" },
        { type: "onboarding-checked", hasCompleted: false },
        {
          type: "security-problem-detected",
          problem: { kind: "insecure-context", message: "x" },
        },
        { type: "initialize-completed" },
      ]);
      expect(s.kind).toBe("security-blocked");
    });

    it("hydration-completed in a non-hydrating state is ignored", () => {
      const s = reduce([{ type: "boot" }, { type: "hydration-completed" }]);
      expect(s.kind).toBe("checking-onboarding");
    });
  });
});
