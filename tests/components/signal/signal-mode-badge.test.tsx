/**
 * Signal's settings live on the Signal page: the mode badge opens them
 * in a dialog. They used to be a section of Settings → Reading, a tab
 * away from the page they change. Open state is in the URL, so the old
 * `?tab=briefings` link can land on the open dialog.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { SignalModeBadge } from "@/components/signal/signal-mode-badge.tsx";
import { useSignalModeStore } from "@/lib/signal-mode-preference";

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="probe-path">{pathname + search}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SignalModeBadge />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("SignalModeBadge", () => {
  beforeEach(() => {
    localStorage.clear();
    useSignalModeStore.setState({ mode: "ml", hidden: false, nightly: false });
  });

  it("shows the current mode and says it opens Signal's settings", () => {
    renderAt("/signal");
    const badge = screen.getByTestId("signal-mode-badge");
    expect(badge).toHaveTextContent("Local");
    expect(badge).toHaveAccessibleName(/signal settings/i);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the settings in a dialog on the Signal page, without leaving it", async () => {
    const user = userEvent.setup();
    renderAt("/signal");

    await user.click(screen.getByTestId("signal-mode-badge"));

    const dialog = await screen.findByRole("dialog", { name: /signal settings/i });
    expect(within(dialog).getByRole("radio", { name: "Local" })).toBeInTheDocument();
    expect(screen.getByTestId("probe-path")).toHaveTextContent("/signal?settings=open");
  });

  it("arrives open from a link that asks for the settings", async () => {
    renderAt("/signal?settings=open");
    expect(await screen.findByRole("dialog", { name: /signal settings/i })).toBeInTheDocument();
  });

  it("changing the mode in the dialog changes the badge", async () => {
    const user = userEvent.setup();
    renderAt("/signal?settings=open");
    const dialog = await screen.findByRole("dialog", { name: /signal settings/i });

    await user.click(within(dialog).getByRole("radio", { name: "AI" }));

    expect(useSignalModeStore.getState().mode).toBe("ai");
    expect(screen.getByTestId("signal-mode-badge")).toHaveTextContent("AI");
  });

  it("closing the dialog clears it from the URL", async () => {
    const user = userEvent.setup();
    renderAt("/signal?settings=open&tab=briefings");
    await screen.findByRole("dialog", { name: /signal settings/i });

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("probe-path").textContent).toBe("/signal?tab=briefings");
  });
});
