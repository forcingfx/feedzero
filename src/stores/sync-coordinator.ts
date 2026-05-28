import { LOCAL_STORAGE } from "@feedzero/core/utils/constants";

/**
 * Sync coordinator — the single home for the "schedule a push after
 * the user mutates something syncable" policy.
 *
 * **What lives here:**
 * - The debounce + jitter timers (a burst of mutations coalesces into
 *   one push 5s + 0–30s later)
 * - The `feedzero:sync-pending-push` localStorage marker that outlives
 *   tab reloads (pull() flushes it before importVault would overwrite
 *   unsynced changes)
 *
 * **What does NOT live here:**
 * - The actual push implementation. Callers pass their `push` function
 *   in via `notifyChange(push)` so this module stays decoupled from
 *   sync-store and is easy to unit-test without mocking the store.
 *
 * **Why a module, not a Zustand store:**
 * Timer + localStorage state has no React-subscribable shape — no
 * component needs to re-render when the debounce ticks. A plain
 * module with internal closure state is the lighter fit.
 *
 * **What's next (ADR 026 — sync-as-subscription):**
 * Today, 38 call sites across feed/article/briefing/smart-filter
 * stores manually call `notifyChange()` after mutating syncable data.
 * The next iteration replaces that with subscriptions: the
 * coordinator observes each store's syncable snapshot via Zustand
 * subscribe + shallow equality, schedules push when the snapshot
 * changes, and the 38 explicit calls go away. The per-store
 * `syncableSnapshot` selector is the bottleneck for that work — it
 * has to be carefully enumerated to avoid silent
 * "data changed but didn't sync" bugs. Out of scope for this commit.
 */

const DEBOUNCE_MS = 5000;
const MAX_JITTER_MS = 30_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let jitterTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Mark that the local DB has changes the cloud hasn't seen yet.
 * Survives a reload that drops the in-memory timer; pull() reads this
 * to decide whether to flush before importing.
 */
function markPendingPush(): void {
  try {
    localStorage.setItem(LOCAL_STORAGE.SYNC_PENDING_PUSH, "1");
  } catch {
    /* localStorage may be unavailable (private browsing, quota) */
  }
}

function clearPendingPushMarker(): void {
  try {
    localStorage.removeItem(LOCAL_STORAGE.SYNC_PENDING_PUSH);
  } catch {
    /* noop */
  }
}

function clearTimers(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (jitterTimer) {
    clearTimeout(jitterTimer);
    jitterTimer = null;
  }
}

/**
 * Schedule a push for "we just mutated something syncable". Coalesces
 * with any in-flight scheduled push — a burst of N mutations within
 * the debounce window produces exactly one push, not N.
 *
 * The push callback is invoked after `DEBOUNCE_MS` + a random
 * `[0, MAX_JITTER_MS)` to spread thundering-herd load when many users
 * mutate at the same moment (e.g. a feed publishes a popular post and
 * everyone marks it read in the same minute).
 */
export function notifyChange(push: () => void | Promise<void>): void {
  markPendingPush();
  clearTimers();
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const jitter = Math.floor(Math.random() * MAX_JITTER_MS);
    jitterTimer = setTimeout(() => {
      jitterTimer = null;
      void push();
    }, jitter);
  }, DEBOUNCE_MS);
}

/**
 * Cancel a scheduled push WITHOUT touching the durable marker.
 * Used by paths that drop the in-flight timer but want pending-push
 * to outlive (e.g. disableSync — user might re-enable; logout — the
 * marker has no harm beyond a one-time push on re-onboard).
 *
 * Matches the legacy `clearPendingTimers()` shape.
 */
export function cancelScheduled(): void {
  clearTimers();
}

/**
 * Cancel a scheduled push AND clear the durable pending marker.
 * Called by paths that fully discard the queued change:
 * - `push` success (the change made it to the cloud)
 * - `forceResync` (an immediate write supersedes the pending queue)
 *
 * Matches the legacy `clearPendingTimers() + clearPendingPush()`
 * pair at those call sites.
 */
export function clearPending(): void {
  clearTimers();
  clearPendingPushMarker();
}

/**
 * True iff local mutations have been queued but not yet pushed. Read
 * by `pull()` before importing the remote vault — if local has a
 * pending change, push it first so the remote import doesn't clobber
 * it.
 */
export function hasPending(): boolean {
  try {
    return localStorage.getItem(LOCAL_STORAGE.SYNC_PENDING_PUSH) !== null;
  } catch {
    return false;
  }
}

/**
 * Test helper: reset the in-memory timer state without touching the
 * localStorage marker. Lets durability tests verify the "marker
 * survives a module re-import" contract.
 */
export function resetForTest(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (jitterTimer) clearTimeout(jitterTimer);
  debounceTimer = null;
  jitterTimer = null;
}
