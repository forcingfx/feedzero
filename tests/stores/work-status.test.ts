/**
 * work-status — single source of truth for "is the app doing async work
 * right now?" Aggregates the per-store busy signals (vault sync,
 * publisher refresh, license verification) so consumer UI (sync badge,
 * boot screens, future progress chrome) reads one selector instead of
 * threading multiple store subscriptions.
 *
 * The recent sync-status-badge bug — "Synced" lit up green while
 * refreshAll was still fetching publisher articles — was the canonical
 * example of why the union must live in one place: each store knew its
 * own truth, none of them knew the user-facing truth.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useSyncStore } from "@/stores/sync-store";
import { useFeedStore } from "@/stores/feed-store";
import { useLicenseStore } from "@/stores/license-store";
import { selectIsAppBusy, selectBusyReason } from "@/stores/work-status";

function snapshot() {
  return {
    sync: useSyncStore.getState(),
    feed: useFeedStore.getState(),
    license: useLicenseStore.getState(),
  };
}

describe("work-status selectors", () => {
  beforeEach(() => {
    useSyncStore.setState({ status: "local-only" });
    useFeedStore.setState({ isRefreshingAll: false });
    useLicenseStore.setState({ verifying: false });
  });

  describe("selectIsAppBusy", () => {
    it("is false when nothing is in flight", () => {
      const s = snapshot();
      expect(selectIsAppBusy(s)).toBe(false);
    });

    it("is true when sync-store is syncing", () => {
      useSyncStore.setState({ status: "syncing" });
      expect(selectIsAppBusy(snapshot())).toBe(true);
    });

    it("is true when feeds are refreshing", () => {
      useFeedStore.setState({ isRefreshingAll: true });
      expect(selectIsAppBusy(snapshot())).toBe(true);
    });

    it("is true when the license is being verified", () => {
      useLicenseStore.setState({ verifying: true });
      expect(selectIsAppBusy(snapshot())).toBe(true);
    });

    it("does NOT consider a sync error a busy state — the user sees the error, not a spinner", () => {
      useSyncStore.setState({ status: "error" });
      expect(selectIsAppBusy(snapshot())).toBe(false);
    });

    it("does NOT consider 'synced' a busy state", () => {
      useSyncStore.setState({ status: "synced" });
      expect(selectIsAppBusy(snapshot())).toBe(false);
    });
  });

  describe("selectBusyReason", () => {
    it("returns null when idle", () => {
      expect(selectBusyReason(snapshot())).toBeNull();
    });

    it("returns 'fetching-feeds' when refreshAll is in flight", () => {
      useFeedStore.setState({ isRefreshingAll: true });
      expect(selectBusyReason(snapshot())).toBe("fetching-feeds");
    });

    it("returns 'syncing-vault' when only the vault is pulling", () => {
      useSyncStore.setState({ status: "syncing" });
      expect(selectBusyReason(snapshot())).toBe("syncing-vault");
    });

    it("returns 'verifying-license' when only the license is being verified", () => {
      useLicenseStore.setState({ verifying: true });
      expect(selectBusyReason(snapshot())).toBe("verifying-license");
    });

    it("prefers 'fetching-feeds' over 'syncing-vault' so the user sees the publisher-facing work that gates fresh articles", () => {
      // During boot, the vault pull and refreshAll's publisher fetches
      // run concurrently. The user-facing concern is "am I looking at
      // fresh articles?" — that's the publisher fetch, not the vault
      // pull. The reason string drives badge copy / progress hints.
      useSyncStore.setState({ status: "syncing" });
      useFeedStore.setState({ isRefreshingAll: true });
      expect(selectBusyReason(snapshot())).toBe("fetching-feeds");
    });

    it("prefers any work over 'verifying-license' (lowest priority)", () => {
      useLicenseStore.setState({ verifying: true });
      useSyncStore.setState({ status: "syncing" });
      expect(selectBusyReason(snapshot())).toBe("syncing-vault");
    });
  });
});
