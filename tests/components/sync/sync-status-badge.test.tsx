import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SyncStatusBadge } from "@/components/sync/sync-status-badge";
import { useSyncStore } from "@/stores/sync-store";
import { useFeedStore } from "@/stores/feed-store";
import { useLicenseStore } from "@/stores/license-store";

/**
 * The persistent "are we synced?" affordance in the top-right of the
 * app shell. Lives outside the sidebar so it's visible on every route
 * — including /settings where the sidebar might be tucked behind a
 * Sheet on narrow viewports.
 *
 * Visual states match the underlying SyncStatus union:
 *   local-only → amber dot, "Local only"
 *   syncing    → animated dot, "Syncing…"
 *   synced     → emerald dot, "Synced · 2 min ago" (relative)
 *   error      → rose dot, "Sync error" + retry chevron
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
    useFeedStore.setState({ isRefreshingAll: false });
    useLicenseStore.setState({ verifying: false });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows amber 'Local only' when sync is off", () => {
    useSyncStore.setState({ status: "local-only", lastSyncedAt: null });
    renderBadge();
    const badge = screen.getByTestId("sync-status-badge");
    expect(badge).toHaveAttribute("data-state", "local-only");
    expect(badge).toHaveTextContent(/local only/i);
  });

  it("shows emerald 'Synced · just now' when freshly synced", () => {
    useSyncStore.setState({
      status: "synced",
      lastSyncedAt: Date.now() - 5_000,
    });
    renderBadge();
    const badge = screen.getByTestId("sync-status-badge");
    expect(badge).toHaveAttribute("data-state", "synced");
    expect(badge).toHaveTextContent(/just now/i);
  });

  it("shows the relative timestamp in minutes when older than a minute", () => {
    useSyncStore.setState({
      status: "synced",
      lastSyncedAt: Date.now() - 3 * 60 * 1000,
    });
    renderBadge();
    expect(screen.getByTestId("sync-status-badge")).toHaveTextContent(
      /3 min ago/i,
    );
  });

  it("shows a spinner and 'Syncing…' during sync", () => {
    useSyncStore.setState({ status: "syncing", lastSyncedAt: null });
    const { container } = renderBadge();
    expect(screen.getByTestId("sync-status-badge")).toHaveAttribute(
      "data-state",
      "syncing",
    );
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("shows 'Sync error' state in red", () => {
    useSyncStore.setState({
      status: "error",
      lastSyncedAt: null,
      error: "fetch failed",
    });
    renderBadge();
    expect(screen.getByTestId("sync-status-badge")).toHaveAttribute(
      "data-state",
      "error",
    );
    expect(screen.getByTestId("sync-status-badge")).toHaveTextContent(
      /sync error/i,
    );
  });

  it("is a link to the Sync & Data settings tab", () => {
    useSyncStore.setState({ status: "synced", lastSyncedAt: Date.now() });
    renderBadge();
    const badge = screen.getByTestId("sync-status-badge");
    expect(badge.tagName).toBe("A");
    expect(badge).toHaveAttribute("href", "/settings?tab=sync-and-data");
  });

  it("shows 'Syncing…' while feeds are refreshing even when the vault is synced", () => {
    // The cloud vault is up to date, but refreshAll is still fetching new
    // articles from publishers. Showing "Synced · just now" in green here
    // is a lie — the user is looking at yesterday's articles until the
    // fetches land. The badge must reflect work in progress, not the
    // narrow "is the vault byte-equal to the cloud?" question.
    useSyncStore.setState({
      status: "synced",
      lastSyncedAt: Date.now() - 5_000,
    });
    useFeedStore.setState({ isRefreshingAll: true });
    const { container } = renderBadge();
    const badge = screen.getByTestId("sync-status-badge");
    expect(badge).toHaveAttribute("data-state", "syncing");
    expect(badge).toHaveTextContent(/syncing/i);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("shows 'Syncing…' while feeds are refreshing for local-only users too", () => {
    // Local-only users don't have a cloud vault, but a publisher refresh
    // is still meaningful work. While it's in flight the badge should
    // reflect that, not the static "Local only" descriptor.
    useSyncStore.setState({ status: "local-only", lastSyncedAt: null });
    useFeedStore.setState({ isRefreshingAll: true });
    renderBadge();
    expect(screen.getByTestId("sync-status-badge")).toHaveAttribute(
      "data-state",
      "syncing",
    );
  });

  it("shows 'Syncing…' while the license is being verified — work-status contract", () => {
    // License recheck is the third busy source aggregated by
    // useIsAppBusy. The badge trusts the selector, so verifying must
    // surface here without the badge knowing about license-store
    // directly. Locks the badge↔selector contract.
    useSyncStore.setState({ status: "synced", lastSyncedAt: Date.now() });
    useLicenseStore.setState({ verifying: true });
    renderBadge();
    expect(screen.getByTestId("sync-status-badge")).toHaveAttribute(
      "data-state",
      "syncing",
    );
  });
});
