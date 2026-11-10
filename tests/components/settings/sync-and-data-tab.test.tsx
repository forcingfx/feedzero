/**
 * <SyncAndDataTab> — sync toggle + import + export + danger zone.
 *
 * Verifies the consolidated tab renders all three sections without
 * blowing up on a fresh local-only user.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SyncAndDataTab } from "@/components/settings/tabs/sync-and-data-tab";
import { useSyncStore } from "@/stores/sync-store";
import { useFeedStore } from "@/stores/feed-store";
import { useLicenseStore } from "@/stores/license-store";

vi.mock("@/core/crypto/passphrase-generator", () => ({
  generatePassphrase: vi.fn().mockResolvedValue("alpha bravo charlie delta"),
}));

function renderTab() {
  return render(
    <MemoryRouter>
      <SyncAndDataTab />
    </MemoryRouter>,
  );
}

describe("<SyncAndDataTab>", () => {
  beforeEach(() => {
    useSyncStore.setState({
      status: "local-only",
      error: null,
      credentials: null,
    });
    useFeedStore.setState({ feeds: [] });
    useLicenseStore.setState({ tier: "personal", verifying: false });
  });

  it("renders the Cloud sync section", () => {
    renderTab();
    expect(
      screen.getByRole("heading", { name: /cloud sync/i }),
    ).toBeInTheDocument();
  });

  it("renders both Import and Export sections side-by-side", () => {
    renderTab();
    expect(
      screen.getByRole("heading", { name: /^Import$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^Export$/i }),
    ).toBeInTheDocument();
  });

  it("shows the Delete all data and reset app button (always available)", () => {
    renderTab();
    expect(
      screen.getByRole("button", { name: /delete all data and reset app/i }),
    ).toBeInTheDocument();
  });
  it("draws no card chrome around sections (audit 2026-Q4 round 2: rows under headings)", () => {
    const { container } = renderTab();
    expect(container.querySelectorAll(".bg-card").length).toBe(0);
  });

  it("puts Danger zone last, after Import and Export (the irreversible action closes the page)", () => {
    renderTab();
    const danger = screen.getByRole("heading", { name: /danger zone/i });
    const exportHeading = screen.getByRole("heading", { name: /^Export$/i });
    // DOCUMENT_POSITION_FOLLOWING (4): danger comes after export in the DOM.
    expect(exportHeading.compareDocumentPosition(danger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

});
