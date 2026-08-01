import { create } from "zustand";

/**
 * Open/close state for the keyboard-shortcuts overlay (`?`).
 *
 * Mirrors command-palette-store: app-wide UI scaffolding, mounted once
 * at the layout level, toggled from `use-keyboard-nav` and the command
 * palette's "Show keyboard shortcuts" action.
 */
interface ShortcutsDialogState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useShortcutsDialogStore = create<ShortcutsDialogState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
