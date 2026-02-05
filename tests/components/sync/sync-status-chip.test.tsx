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

  describe.each([
    {
      status: "local-only" as const,
      label: "Local only",
      textClass: "text-sync-local",
      bgClass: "bg-sync-local-bg",
      hoverBg: "hover:bg-amber-600",
      hoverText: "hover:text-white",
    },
    {
      status: "synced" as const,
      label: "Synced",
      textClass: "text-sync-synced",
      bgClass: "bg-sync-synced-bg",
      hoverBg: "hover:bg-green-700",
      hoverText: "hover:text-white",
    },
    {
      status: "error" as const,
      label: "Sync error",
      textClass: "text-sync-error",
      bgClass: "bg-sync-error-bg",
      hoverBg: "hover:bg-red-700",
      hoverText: "hover:text-white",
    },
    {
      status: "syncing" as const,
      label: "Syncing...",
      textClass: "text-muted-foreground",
      bgClass: "bg-muted",
      hoverBg: "hover:bg-sidebar-accent",
      hoverText: "hover:text-sidebar-accent-foreground",
    },
  ])(
    "$status status",
    ({ status, label, textClass, bgClass, hoverBg, hoverText }) => {
      beforeEach(() => {
        useSyncStore.setState({ status });
      });

      it(`displays "${label}" label`, () => {
        render(<SyncStatusChip />);
        expect(screen.getByText(label)).toBeInTheDocument();
      });

      it(`has ${textClass} and ${bgClass} colors`, () => {
        render(<SyncStatusChip />);
        const button = screen.getByRole("button");
        expect(button).toHaveClass(textClass);
        expect(button).toHaveClass(bgClass);
      });

      it(`has ${hoverBg} hover state`, () => {
        render(<SyncStatusChip />);
        const button = screen.getByRole("button");
        expect(button).toHaveClass(hoverBg);
        expect(button).toHaveClass(hoverText);
      });
    },
  );

  describe("behavior", () => {
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
