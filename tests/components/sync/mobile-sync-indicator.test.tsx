/**
 * The phone's sync status (owner request, 2026-11-19): a thin bar at the
 * top that is blue while work is in flight and turns green as it lands,
 * with a brief chip saying so. It replaces the header's status dot.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MobileSyncIndicator } from "@/components/sync/mobile-sync-indicator.tsx";
import { useSyncStore } from "@/stores/sync-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";

function bar() {
  return screen.getByTestId("mobile-sync-indicator");
}

describe("MobileSyncIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSyncStore.setState({ status: "local-only" });
    useFeedStore.setState({ isRefreshingAll: false });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is out of sight while nothing is happening", () => {
    render(<MobileSyncIndicator />);
    expect(bar()).toHaveAttribute("data-state", "idle");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByTestId("mobile-sync-chip")).toBeNull();
  });

  it("is a blue progress bar while feeds refresh", () => {
    render(<MobileSyncIndicator />);
    act(() => useFeedStore.setState({ isRefreshingAll: true }));

    expect(bar()).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("progressbar", { name: "Refreshing feeds" })).toBeInTheDocument();
    expect(screen.getByTestId("mobile-sync-fill").className).toContain("bg-info");
  });

  it("is a blue progress bar while the vault syncs", () => {
    render(<MobileSyncIndicator />);
    act(() => useSyncStore.setState({ status: "syncing" }));

    expect(bar()).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("progressbar", { name: "Syncing" })).toBeInTheDocument();
  });

  it("turns green when the work lands, then gets out of the way", () => {
    render(<MobileSyncIndicator />);
    act(() => useFeedStore.setState({ isRefreshingAll: true }));
    act(() => useFeedStore.setState({ isRefreshingAll: false }));

    expect(bar()).toHaveAttribute("data-state", "done");
    expect(screen.getByTestId("mobile-sync-fill").className).toContain("bg-success");

    act(() => vi.advanceTimersByTime(1500));

    expect(bar()).toHaveAttribute("data-state", "idle");
  });

  it("says 'Synced' briefly after a refresh on a synced account", () => {
    useSyncStore.setState({ status: "synced" });
    render(<MobileSyncIndicator />);
    act(() => useFeedStore.setState({ isRefreshingAll: true }));
    act(() => useFeedStore.setState({ isRefreshingAll: false }));

    const chip = screen.getByTestId("mobile-sync-chip");
    expect(chip).toHaveTextContent("Synced");
    expect(chip).toHaveAttribute("role", "status");

    act(() => vi.advanceTimersByTime(1500));

    expect(screen.queryByTestId("mobile-sync-chip")).toBeNull();
  });

  // Owner request 2026-11-20: a small animated checkmark on "done", and a
  // dismissal that eases out instead of vanishing.
  it("draws a checkmark beside the outcome", () => {
    useSyncStore.setState({ status: "synced" });
    render(<MobileSyncIndicator />);
    act(() => useFeedStore.setState({ isRefreshingAll: true }));
    act(() => useFeedStore.setState({ isRefreshingAll: false }));

    const check = screen.getByTestId("mobile-sync-check");
    expect(check).toHaveAttribute("aria-hidden", "true");
    expect(check.querySelector("path")!.getAttribute("class")).toContain("sync-check-draw");
    // The chip's text is still the whole accessible message.
    expect(screen.getByTestId("mobile-sync-chip")).toHaveTextContent(/^Synced$/);
  });

  it("eases the bar and the chip out before removing them", () => {
    useSyncStore.setState({ status: "synced" });
    render(<MobileSyncIndicator />);
    act(() => useFeedStore.setState({ isRefreshingAll: true }));
    act(() => useFeedStore.setState({ isRefreshingAll: false }));

    act(() => vi.advanceTimersByTime(1200));

    expect(bar()).toHaveAttribute("data-state", "leaving");
    expect(screen.getByTestId("mobile-sync-chip").className).toContain("sync-chip-out");
    expect(screen.getByTestId("mobile-sync-fill").className).toContain("sync-bar-out");

    act(() => vi.advanceTimersByTime(300));

    expect(bar()).toHaveAttribute("data-state", "idle");
    expect(screen.queryByTestId("mobile-sync-chip")).toBeNull();
  });

  it("new work arriving mid-dismissal takes over at once", () => {
    render(<MobileSyncIndicator />);
    act(() => useFeedStore.setState({ isRefreshingAll: true }));
    act(() => useFeedStore.setState({ isRefreshingAll: false }));
    act(() => vi.advanceTimersByTime(1250));

    act(() => useFeedStore.setState({ isRefreshingAll: true }));

    expect(bar()).toHaveAttribute("data-state", "active");
    expect(screen.queryByTestId("mobile-sync-chip")).toBeNull();
  });

  it("an error chip carries no checkmark", () => {
    render(<MobileSyncIndicator />);
    act(() => useSyncStore.setState({ status: "error" }));
    expect(screen.queryByTestId("mobile-sync-check")).toBeNull();
  });

  it("says 'Up to date' on a local-only account, which has nothing to sync", () => {
    render(<MobileSyncIndicator />);
    act(() => useFeedStore.setState({ isRefreshingAll: true }));
    act(() => useFeedStore.setState({ isRefreshingAll: false }));

    expect(screen.getByTestId("mobile-sync-chip")).toHaveTextContent("Up to date");
  });

  // Pin: every star and read mark pushes the vault a moment later. A chip
  // for each would be a notification per tap, so background pushes get the
  // bar only; the chip is for a refresh the reader can see land.
  it("shows the bar but no chip for a background vault push", () => {
    useSyncStore.setState({ status: "synced" });
    render(<MobileSyncIndicator />);
    act(() => useSyncStore.setState({ status: "syncing" }));
    act(() => useSyncStore.setState({ status: "synced" }));

    expect(bar()).toHaveAttribute("data-state", "done");
    expect(screen.queryByTestId("mobile-sync-chip")).toBeNull();
  });

  it("stays in flight until both the refresh and the sync have finished", () => {
    useSyncStore.setState({ status: "synced" });
    render(<MobileSyncIndicator />);
    act(() => useFeedStore.setState({ isRefreshingAll: true }));
    act(() => useSyncStore.setState({ status: "syncing" }));
    act(() => useFeedStore.setState({ isRefreshingAll: false }));

    expect(bar()).toHaveAttribute("data-state", "active");

    act(() => useSyncStore.setState({ status: "synced" }));

    expect(bar()).toHaveAttribute("data-state", "done");
    expect(screen.getByTestId("mobile-sync-chip")).toHaveTextContent("Synced");
  });

  // Pin: an error is the one state that must not be subtle or brief.
  it("holds a red bar and says so for as long as sync is failing", () => {
    render(<MobileSyncIndicator />);
    act(() => useSyncStore.setState({ status: "error" }));

    expect(bar()).toHaveAttribute("data-state", "error");
    expect(screen.getByTestId("mobile-sync-fill").className).toContain("bg-destructive");
    expect(screen.getByTestId("mobile-sync-chip")).toHaveTextContent("Sync error");

    act(() => vi.advanceTimersByTime(60_000));

    expect(bar()).toHaveAttribute("data-state", "error");
    expect(screen.getByTestId("mobile-sync-chip")).toBeInTheDocument();
  });

  it("sits in the status bar's safe area, above everything but the reader", () => {
    render(<MobileSyncIndicator />);
    expect(bar().className).toContain("top-[env(safe-area-inset-top)]");
    expect(bar().className).toContain("pointer-events-none");
  });
});
