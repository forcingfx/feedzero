/**
 * The single source of truth for every advertised keyboard shortcut.
 *
 * Rendered by BOTH the `?` overlay (KeyboardShortcutsDialog) and
 * Settings → Help. Before this module existed each surface kept its own
 * copy and they drifted (docs advertised `e` for the view toggle while
 * the code shipped `h`). If you add or change a binding in
 * `use-keyboard-nav.ts` or `explore-catalog.tsx`, update it here — the
 * component tests assert on entries from this module.
 */

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.userAgent);

export interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["j", "↓"], description: "Next article" },
      { keys: ["k", "↑"], description: "Previous article" },
      { keys: ["u"], description: "Next feed" },
      { keys: ["i"], description: "Previous feed" },
      { keys: ["Space"], description: "Scroll article down" },
      { keys: ["Shift+Space"], description: "Scroll article up" },
      { keys: ["["], description: "Toggle sidebar" },
      { keys: ["n"], description: "Go to Explore" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: [isMac ? "⌘K" : "Ctrl+K"], description: "Open command palette" },
      { keys: ["o"], description: "Open original article" },
      { keys: ["h"], description: "Toggle full text view" },
      { keys: ["s"], description: "Star article" },
      { keys: ["r"], description: "Refresh all feeds" },
      { keys: [isMac ? "⌘," : "Ctrl+,"], description: "Open settings" },
      { keys: ["?"], description: "Show keyboard shortcuts" },
    ],
  },
  {
    title: "Explore",
    shortcuts: [
      { keys: ["/"], description: "Focus search" },
      { keys: ["Tab", "↓"], description: "Exit search into list" },
      { keys: ["Enter"], description: "Add selected feed" },
      { keys: ["p"], description: "Preview feed" },
      { keys: ["1"], description: "Featured tab" },
      { keys: ["2"], description: "Topics tab" },
      { keys: ["3"], description: "Countries tab" },
      { keys: ["Esc"], description: "Deselect / clear search" },
    ],
  },
];
