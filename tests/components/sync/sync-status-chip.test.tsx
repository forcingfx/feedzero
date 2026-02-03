import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncStatusChip } from "@/components/sync/sync-status-chip";
import { useSyncStore } from "@/stores/sync-store";

describe("SyncStatusChip", () => {
  beforeEach(() => {
    useSyncStore.setState({
      status: "local-only",
      dialogOpen: false,
    });
  });

  describe("color-coded states", () => {
    it("renders with amber colors for local-only status", () => {
      useSyncStore.setState({ status: "local-only" });
      render(<SyncStatusChip />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("text-sync-local");
      expect(button).toHaveClass("bg-sync-local-bg");
    });

    it("renders with green colors for synced status", () => {
      useSyncStore.setState({ status: "synced" });
      render(<SyncStatusChip />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("text-sync-synced");
      expect(button).toHaveClass("bg-sync-synced-bg");
    });

    it("renders with red colors for error status", () => {
      useSyncStore.setState({ status: "error" });
      render(<SyncStatusChip />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("text-sync-error");
      expect(button).toHaveClass("bg-sync-error-bg");
    });

    it("renders with muted colors for syncing status", () => {
      useSyncStore.setState({ status: "syncing" });
      render(<SyncStatusChip />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("text-muted-foreground");
      expect(button).toHaveClass("bg-muted");
    });
  });

  describe("behavior", () => {
    it("displays correct label for each status", () => {
      useSyncStore.setState({ status: "local-only" });
      const { rerender } = render(<SyncStatusChip />);
      expect(screen.getByText("Local only")).toBeInTheDocument();

      useSyncStore.setState({ status: "synced" });
      rerender(<SyncStatusChip />);
      expect(screen.getByText("Synced")).toBeInTheDocument();

      useSyncStore.setState({ status: "syncing" });
      rerender(<SyncStatusChip />);
      expect(screen.getByText("Syncing...")).toBeInTheDocument();

      useSyncStore.setState({ status: "error" });
      rerender(<SyncStatusChip />);
      expect(screen.getByText("Sync error")).toBeInTheDocument();
    });

    it("opens dialog when clicked", async () => {
      const user = userEvent.setup();
      const setDialogOpen = vi.fn();
      useSyncStore.setState({ setDialogOpen });

      render(<SyncStatusChip />);
      await user.click(screen.getByRole("button"));

      expect(setDialogOpen).toHaveBeenCalledWith(true);
    });

    it("shows spinner animation for syncing status", () => {
      useSyncStore.setState({ status: "syncing" });
      render(<SyncStatusChip />);

      const icon = screen.getByRole("button").querySelector("svg");
      expect(icon).toHaveClass("animate-spin");
    });
  });
});
