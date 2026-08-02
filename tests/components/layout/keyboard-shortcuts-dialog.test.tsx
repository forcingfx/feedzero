import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KeyboardShortcutsDialog } from "@/components/layout/keyboard-shortcuts-dialog.tsx";
import { useShortcutsDialogStore } from "@/stores/shortcuts-dialog-store.ts";

/**
 * The `?` overlay. Content comes from the shared SHORTCUT_GROUPS module
 * (src/lib/keyboard-shortcuts.ts) — the same source the Settings → Help
 * tab renders — so the two surfaces can no longer drift apart.
 */
describe("<KeyboardShortcutsDialog>", () => {
  beforeEach(() => {
    useShortcutsDialogStore.setState({ isOpen: false });
  });

  it("renders nothing while closed", () => {
    render(<KeyboardShortcutsDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens from the store and lists the real shortcuts", () => {
    useShortcutsDialogStore.setState({ isOpen: true });
    render(<KeyboardShortcutsDialog />);

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: /keyboard shortcuts/i }),
    ).toBeInTheDocument();
    // Entries that exist in use-keyboard-nav but were missing from the
    // old drifted copies:
    expect(within(dialog).getByText(/star article/i)).toBeInTheDocument();
    expect(within(dialog).getByText("?")).toBeInTheDocument();
    // The view toggle is `h` — the old docs advertised `e`, which never
    // matched the code.
    expect(within(dialog).getByText("h")).toBeInTheDocument();
    expect(within(dialog).queryByText("e")).toBeNull();
  });

  it("files Explore-only shortcuts under the Explore group, not global actions", () => {
    useShortcutsDialogStore.setState({ isOpen: true });
    render(<KeyboardShortcutsDialog />);

    const dialog = screen.getByRole("dialog");
    const exploreHeading = within(dialog).getByText("Explore");
    const exploreGroup = exploreHeading.parentElement!;
    // "Add selected feed" (Enter) and "Preview feed" (p) only work on the
    // Explore page — listing them as global actions was a lie.
    expect(
      within(exploreGroup).getByText(/add selected feed/i),
    ).toBeInTheDocument();
    expect(within(exploreGroup).getByText(/preview feed/i)).toBeInTheDocument();
  });

  it("closes via Escape and syncs the store", async () => {
    const user = userEvent.setup();
    useShortcutsDialogStore.setState({ isOpen: true });
    render(<KeyboardShortcutsDialog />);

    await user.keyboard("{Escape}");

    expect(useShortcutsDialogStore.getState().isOpen).toBe(false);
  });
});
