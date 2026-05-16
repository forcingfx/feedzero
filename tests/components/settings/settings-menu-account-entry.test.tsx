/**
 * SettingsMenu should expose an "Account" entry that opens the unified
 * Settings dialog on the Account tab.
 *
 * Phase A scope: just add the entry to the existing dropdown + list
 * variants. The dropdown itself stays — Phase B will replace it with a
 * single sidebar button. This test guards the visibility fix: prior to
 * PR #85 the only path to the Account tab was buried in the Explore
 * page's "Import / Export" button.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsMenu } from "@/components/settings/settings-menu";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStore } from "@/stores/sync-store";
import { useAppStore } from "@/stores/app-store";

vi.mock("@/components/layout/keyboard-shortcuts-dialog", () => ({
  KeyboardShortcutsDialog: () => null,
}));
vi.mock("@/components/feedback/feedback-dialog", () => ({
  FeedbackDialog: () => null,
}));
vi.mock("@/components/folders/auto-organize-dialog", () => ({
  AutoOrganizeDialog: () => null,
}));

function renderMenu() {
  return render(
    <SidebarProvider>
      <SettingsMenu variant="list" hasFeeds={false} onWhatsNew={() => {}} />
    </SidebarProvider>,
  );
}

describe("SettingsMenu Account entry", () => {
  beforeEach(() => {
    useSettingsStore.setState({ open: false, activeTab: "account" });
    useSyncStore.setState({ status: "local-only" });
    useAppStore.setState({ groupArticleFloods: false });
  });

  it("renders an Account menu item in the list variant", () => {
    renderMenu();
    expect(screen.getByText(/account/i)).toBeInTheDocument();
  });

  it("clicking Account opens the Settings dialog on the Account tab", () => {
    renderMenu();
    fireEvent.click(screen.getByText(/account/i));
    const s = useSettingsStore.getState();
    expect(s.open).toBe(true);
    expect(s.activeTab).toBe("account");
  });

  // Note: the dropdown variant uses Radix DropdownMenu which portals its
  // content outside the DOM tree happy-dom can fully render. Behavior-test
  // via the list variant above is sufficient — both variants share the
  // same onClick handler that calls openSettings("account"). When Phase B
  // deletes the dropdown entirely (replaced by a single sidebar button
  // that calls openSettings()), this concern goes away.
});
