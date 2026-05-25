import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SyncStatusBadge } from "@/components/sync/sync-status-badge";
import { useSyncStore } from "@/stores/sync-store";

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
});
