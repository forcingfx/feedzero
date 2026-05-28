import { useSyncStore, type SyncStatus } from "./sync-store.ts";
import { useFeedStore } from "./feed-store.ts";
import { useLicenseStore } from "./license-store.ts";

/**
 * Categories of async work the app exposes to the user. Drives badge
 * copy, progress chrome, and any future "is this safe to navigate
 * away?" gate. Priority on read is fetching-feeds > syncing-vault >
 * verifying-license — see {@link selectBusyReason} for why.
 */
export type BusyReason =
  | "fetching-feeds"
  | "syncing-vault"
  | "verifying-license";

/**
 * Snapshot shape the pure selectors consume. Hook wrappers below
 * subscribe to the live stores and pass this in. Decoupling lets the
 * selectors stay testable without a React tree.
 */
export interface WorkStatusSnapshot {
  sync: { status: SyncStatus };
  feed: { isRefreshingAll: boolean };
  license: { verifying: boolean };
}

/**
 * True when any async work the user cares about is in flight. An
 * `error` sync status is NOT busy — the user needs to see the error,
 * not a spinner.
 */
export function selectIsAppBusy(s: WorkStatusSnapshot): boolean {
  return (
    s.sync.status === "syncing" ||
    s.feed.isRefreshingAll ||
    s.license.verifying
  );
}

/**
 * The single reason to surface when multiple are in flight.
 *
 * Order matters: during boot the vault pull and refreshAll's publisher
 * fetches run concurrently. The user's question is "am I looking at
 * fresh articles?" — that's the publisher fetch, not the vault round-
 * trip. License verification is lowest priority; it's background hygiene
 * the user only notices through tier flips, never through a spinner.
 */
export function selectBusyReason(s: WorkStatusSnapshot): BusyReason | null {
  if (s.feed.isRefreshingAll) return "fetching-feeds";
  if (s.sync.status === "syncing") return "syncing-vault";
  if (s.license.verifying) return "verifying-license";
  return null;
}

/** React hook: subscribes to the contributing stores; recomputes only when the relevant slices change. */
export function useIsAppBusy(): boolean {
  const status = useSyncStore((s) => s.status);
  const isRefreshingAll = useFeedStore((s) => s.isRefreshingAll);
  const verifying = useLicenseStore((s) => s.verifying);
  return selectIsAppBusy({
    sync: { status },
    feed: { isRefreshingAll },
    license: { verifying },
  });
}

/** React hook companion to {@link selectBusyReason}. */
export function useBusyReason(): BusyReason | null {
  const status = useSyncStore((s) => s.status);
  const isRefreshingAll = useFeedStore((s) => s.isRefreshingAll);
  const verifying = useLicenseStore((s) => s.verifying);
  return selectBusyReason({
    sync: { status },
    feed: { isRefreshingAll },
    license: { verifying },
  });
}
