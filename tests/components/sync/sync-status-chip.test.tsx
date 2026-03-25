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

  it("shows 'Cloud sync' label", () => {
    render(<SyncStatusChip />);
    expect(screen.getByText("Cloud sync")).toBeInTheDocument();
  });

  it("renders a switch in unchecked state for local-only", () => {
    render(<SyncStatusChip />);
    const toggle = screen.getByRole("switch");
    expect(toggle).not.toBeChecked();
  });

  it("renders a switch in checked state for synced", () => {
    useSyncStore.setState({ status: "synced" });
    render(<SyncStatusChip />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toBeChecked();
  });

  it("opens dialog when clicked", async () => {
    const user = userEvent.setup();
    const setDialogOpen = vi.fn();
    useSyncStore.setState({ setDialogOpen });

    render(<SyncStatusChip />);
    await user.click(screen.getByText("Cloud sync"));

    expect(setDialogOpen).toHaveBeenCalledWith(true);
  });

  it("shows spinner animation for syncing status", () => {
    useSyncStore.setState({ status: "syncing" });
    const { container } = render(<SyncStatusChip />);

    const spinner = container.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  it("switch is checked during syncing", () => {
    useSyncStore.setState({ status: "syncing" });
    render(<SyncStatusChip />);
    expect(screen.getByRole("switch")).toBeChecked();
  });
});
