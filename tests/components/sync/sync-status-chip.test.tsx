import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { SyncStatusChip } from "@/components/sync/sync-status-chip";
import { useSyncStore } from "@/stores/sync-store";
import { useLicenseStore } from "@/stores/license-store";

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="probe-path">{pathname + search}</div>;
}

function renderChip() {
  return render(
    <MemoryRouter initialEntries={["/feeds"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <SyncStatusChip />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SyncStatusChip", () => {
  beforeEach(() => {
    useSyncStore.setState({
      status: "local-only",
    });
    useLicenseStore.setState({ tier: "free", verifying: false });
  });

  it("shows 'Cloud sync' label", () => {
    renderChip();
    expect(screen.getByText("Cloud sync")).toBeInTheDocument();
  });

  it("renders a switch in unchecked state for local-only", () => {
    renderChip();
    const toggle = screen.getByRole("switch");
    expect(toggle).not.toBeChecked();
  });

  it("renders a switch in checked state for synced", () => {
    useSyncStore.setState({ status: "synced" });
    renderChip();
    const toggle = screen.getByRole("switch");
    expect(toggle).toBeChecked();
  });

  it("navigates to Settings on the Data tab when clicked", async () => {
    const user = userEvent.setup();
    renderChip();
    await user.click(screen.getByText("Cloud sync"));
    expect(screen.getByTestId("probe-path")).toHaveTextContent(
      "/settings?tab=data",
    );
  });

  it("shows spinner animation for syncing status", () => {
    useSyncStore.setState({ status: "syncing" });
    const { container } = renderChip();

    const spinner = container.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  it("switch is checked during syncing", () => {
    useSyncStore.setState({ status: "syncing" });
    renderChip();
    expect(screen.getByRole("switch")).toBeChecked();
  });
});
