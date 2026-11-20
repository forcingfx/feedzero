import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SyncStatusBadge } from "@/components/sync/sync-status-badge";
import { useSyncStore } from "@/stores/sync-store";
import { useFeedStore } from "@/stores/feed-store";
import { useLicenseStore } from "@/stores/license-store";

/**
 * The persistent "what's happening with my data?" affordance in the
 * sidebar header. It surfaces two independent facts in one line:
 *
 *   <refresh state> · <sync mode>
 *
 * `refresh state` is about the publisher fetch — "Refreshing…" /
 * "Refreshed 5 min ago". It changes every ~30 min.
 *
 * `sync mode` is whether the user has cloud sync turned on — "local"
 * or "synced". It usually changes once.
 *
 * Conflating them (which the old "Local only" / "Synced" pill did,
 * via useIsAppBusy) made the badge look like it was always "Syncing…"
 * during routine refreshes, which buried the actual mode.
 *
 * Visual rules:
 *   - Idle states are visually subtle (muted text + small dot).
 *   - Active states use the sky/spinner colour to signal "in flight".
 *   - Errors stay loud rose — that's a signal the user needs to see.
 */
function renderBadge() {
  return render(
    <MemoryRouter>
      <SyncStatusBadge />
    </MemoryRouter>,
  );
}

describe("SyncStatusBadge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T20:00:00Z"));
    useFeedStore.setState({ isRefreshingAll: false, lastRefreshAllAt: null });
    useLicenseStore.setState({ verifying: false });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("idle states", () => {
    it("shows just 'Local' when local-only with no refresh history", () => {
      useSyncStore.setState({ status: "local-only", lastSyncedAt: null });
      renderBadge();
      const badge = screen.getByTestId("sync-status-badge");
      expect(badge).toHaveAttribute("data-state", "local-only");
      expect(badge).toHaveTextContent(/^Local$/);
    });

    it("shows just 'Synced' when sync-on with no refresh history", () => {
      useSyncStore.setState({ status: "synced", lastSyncedAt: Date.now() });
      renderBadge();
      const badge = screen.getByTestId("sync-status-badge");
      expect(badge).toHaveAttribute("data-state", "synced");
      expect(badge).toHaveTextContent(/^Synced$/);
    });

    it("shows 'Refreshed 5 min ago · local' for local-only with refresh history", () => {
      useFeedStore.setState({ lastRefreshAllAt: Date.now() - 5 * 60_000 });
      useSyncStore.setState({ status: "local-only", lastSyncedAt: null });
      renderBadge();
      const badge = screen.getByTestId("sync-status-badge");
      expect(badge).toHaveTextContent("Refreshed 5 min ago · local");
    });

    it("shows 'Refreshed 5 min ago · synced' for sync users with refresh history", () => {
      useFeedStore.setState({ lastRefreshAllAt: Date.now() - 5 * 60_000 });
      useSyncStore.setState({ status: "synced", lastSyncedAt: Date.now() });
      renderBadge();
      const badge = screen.getByTestId("sync-status-badge");
      expect(badge).toHaveTextContent("Refreshed 5 min ago · synced");
    });

    it("shows 'Refreshed just now' for a freshly-completed refresh", () => {
      useFeedStore.setState({ lastRefreshAllAt: Date.now() - 5_000 });
      useSyncStore.setState({ status: "local-only", lastSyncedAt: null });
      renderBadge();
      expect(screen.getByTestId("sync-status-badge")).toHaveTextContent(
        /Refreshed just now/,
      );
    });

    it("idle states render the muted-foreground text colour (subtle)", () => {
      useFeedStore.setState({ lastRefreshAllAt: Date.now() - 60_000 });
      useSyncStore.setState({ status: "synced", lastSyncedAt: Date.now() });
      renderBadge();
      const badge = screen.getByTestId("sync-status-badge");
      expect(badge.className).toContain("text-muted-foreground");
    });
  });

  describe("active states", () => {
    it("shows 'Refreshing… · local' with spinner while refreshing locally", () => {
      useFeedStore.setState({ isRefreshingAll: true });
      useSyncStore.setState({ status: "local-only", lastSyncedAt: null });
      const { container } = renderBadge();
      expect(screen.getByTestId("sync-status-badge")).toHaveTextContent(
        "Refreshing… · local",
      );
      expect(container.querySelector(".animate-spin")).not.toBeNull();
    });

    it("shows 'Refreshing… · synced' with spinner while refreshing under sync", () => {
      useFeedStore.setState({ isRefreshingAll: true });
      useSyncStore.setState({ status: "synced", lastSyncedAt: Date.now() });
      renderBadge();
      expect(screen.getByTestId("sync-status-badge")).toHaveTextContent(
        "Refreshing… · synced",
      );
    });

    it("shows 'Syncing… · synced' when the vault push is in flight", () => {
      useSyncStore.setState({ status: "syncing", lastSyncedAt: null });
      renderBadge();
      const badge = screen.getByTestId("sync-status-badge");
      expect(badge).toHaveAttribute("data-state", "syncing");
      expect(badge).toHaveTextContent("Syncing… · synced");
    });

    it("license verify does NOT promote the badge to the active state", () => {
      // License re-check is background plumbing — surfacing it as
      // "Syncing…" the way the old badge did made every license refresh
      // look like a cloud event. The badge ignores it now; the license
      // store has its own surfaces (Settings → Account).
      useFeedStore.setState({ lastRefreshAllAt: Date.now() - 60_000 });
      useSyncStore.setState({ status: "synced", lastSyncedAt: Date.now() });
      useLicenseStore.setState({ verifying: true });
      renderBadge();
      const badge = screen.getByTestId("sync-status-badge");
      expect(badge).toHaveAttribute("data-state", "synced");
      expect(badge).not.toHaveTextContent(/Syncing/);
    });
  });

  describe("error state", () => {
    it("shows 'Sync error' in rose regardless of refresh state", () => {
      useFeedStore.setState({ lastRefreshAllAt: Date.now() - 60_000 });
      useSyncStore.setState({
        status: "error",
        lastSyncedAt: null,
        error: "fetch failed",
      });
      renderBadge();
      const badge = screen.getByTestId("sync-status-badge");
      expect(badge).toHaveAttribute("data-state", "error");
      expect(badge).toHaveTextContent(/Sync error/);
    });
  });

  it("is a link to the Sync & Data settings tab", () => {
    useSyncStore.setState({ status: "synced", lastSyncedAt: Date.now() });
    renderBadge();
    const badge = screen.getByTestId("sync-status-badge");
    expect(badge.tagName).toBe("A");
    expect(badge).toHaveAttribute("href", "/settings?tab=sync-and-data");
  });
});
