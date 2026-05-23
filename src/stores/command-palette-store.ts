import { create } from "zustand";

/**
 * Open/close state for the global command palette (⌘K / Ctrl+K).
 *
 * Lives as a dedicated store rather than in a per-feature store
 * because the palette is app-wide UI scaffolding, not feature state —
 * mounted at <App>, toggled from the keyboard hook in
 * `use-keyboard-nav`, and consumed by `<CommandPalette>` and any
 * future invite buttons (e.g. a header chip that says "press ⌘K").
 */
interface CommandPaletteState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
