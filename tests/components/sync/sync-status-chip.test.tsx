import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncStatusChip } from "@/components/sync/sync-status-chip";
import { useSyncStore } from "@/stores/sync-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useLicenseStore } from "@/stores/license-store";

describe("SyncStatusChip", () => {
  beforeEach(() => {
    useSyncStore.setState({
      status: "local-only",
    });
    useSettingsStore.setState({ open: false, activeTab: "account" });
    useLicenseStore.setState({ tier: "free", verifying: false });
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

  it("opens Settings on the Account tab when clicked (Phase B unification)", async () => {
    const user = userEvent.setup();
    render(<SyncStatusChip />);
    await user.click(screen.getByText("Cloud sync"));
    const s = useSettingsStore.getState();
    expect(s.open).toBe(true);
    expect(s.activeTab).toBe("account");
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
