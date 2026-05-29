/**
 * sync-coordinator — the single home for the "schedule a push when
 * local data changed" policy.
 *
 * Before extraction: 38 call sites across feed/article/briefing/
 * smart-filter stores each called `useSyncStore.getState().scheduleSyncPush()`,
 * which manipulated module-level `debounceTimer` and `jitterTimer`
 * variables inside sync-store. The policy (debounce 5s, jitter 0-30s,
 * mark pending-push in localStorage) was buried inside sync-store
 * alongside unrelated state-machine logic and was awkward to reason
 * about as a whole.
 *
 * After extraction (this module): the policy lives in one place.
 * Behaviour is unchanged — the tests below lock the contract sync-store's
 * tests were already implicitly verifying. The structural fix
 * (replacing the 38 explicit calls with subscription-based push
 * derived from store state changes) is the follow-up; see ADR 026.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  notifyChange,
  clearPending,
  cancelScheduled,
  hasPending,
  resetForTest,
} from "@/stores/sync-coordinator";
import { LOCAL_STORAGE } from "@feedzero/core/utils/constants";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("sync-coordinator", () => {
  let push: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorageMock.clear();
    push = vi.fn().mockResolvedValue(undefined);
    resetForTest();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("notifyChange", () => {
    it("does NOT call push synchronously — there's a debounce window", () => {
      notifyChange(push);
      expect(push).not.toHaveBeenCalled();
    });

    it("calls push after the debounce + jitter window elapses", () => {
      notifyChange(push);
      // Advance past debounce (5s) and the max jitter (30s) — push must
      // have fired by then regardless of the random jitter value.
      vi.advanceTimersByTime(5_000 + 30_000);
      expect(push).toHaveBeenCalledTimes(1);
    });

    it("coalesces multiple notifications in the debounce window into a single push", () => {
      // The whole point of debouncing: a burst of mutations (e.g. user
      // reorders 10 feeds in a row) should not produce 10 pushes.
      notifyChange(push);
      vi.advanceTimersByTime(2_000);
      notifyChange(push);
      vi.advanceTimersByTime(2_000);
      notifyChange(push);
      // 4s elapsed within the third notify's debounce window. Push has
      // NOT fired yet.
      vi.advanceTimersByTime(4_000);
      // Advance past the final debounce + max jitter to be sure.
      vi.advanceTimersByTime(5_000 + 30_000);
      expect(push).toHaveBeenCalledTimes(1);
    });

    it("marks pending-push in localStorage immediately on notify", () => {
      // The marker outlives a tab reload that drops the in-memory timer;
      // pull() flushes pending-push before importVault would overwrite
      // the unsynced change.
      notifyChange(push);
      expect(localStorage.getItem(LOCAL_STORAGE.SYNC_PENDING_PUSH)).toBe("1");
    });
  });

  describe("clearPending", () => {
    it("cancels a scheduled push (no callback fires later)", () => {
      notifyChange(push);
      clearPending();
      vi.advanceTimersByTime(5_000 + 30_000);
      expect(push).not.toHaveBeenCalled();
    });

    it("clears the pending-push localStorage marker", () => {
      notifyChange(push);
      clearPending();
      expect(localStorage.getItem(LOCAL_STORAGE.SYNC_PENDING_PUSH)).toBeNull();
    });
  });

  describe("cancelScheduled", () => {
    it("cancels the in-flight timer but leaves the marker so pull() can flush later", () => {
      // The legacy `clearPendingTimers()` shape — used by disableSync
      // and logout, paths that want to stop the timer but accept that
      // the marker stays around as a hint for the next sync session.
      notifyChange(push);
      cancelScheduled();
      vi.advanceTimersByTime(5_000 + 30_000);
      expect(push).not.toHaveBeenCalled();
      expect(localStorage.getItem(LOCAL_STORAGE.SYNC_PENDING_PUSH)).toBe("1");
    });
  });

  describe("hasPending", () => {
    it("is true between notifyChange and clearPending", () => {
      expect(hasPending()).toBe(false);
      notifyChange(push);
      expect(hasPending()).toBe(true);
      clearPending();
      expect(hasPending()).toBe(false);
    });

    it("survives a re-import of the module (localStorage is the source of truth)", () => {
      // This is the durability test: pull() relies on hasPending across
      // a tab reload that drops the timer state. Simulated here by
      // resetting in-memory state (resetForTest) without clearing
      // localStorage.
      notifyChange(push);
      resetForTest();
      expect(hasPending()).toBe(true);
    });
  });
});
