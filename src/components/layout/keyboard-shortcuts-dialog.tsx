import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["j", "↓"], description: "Next article" },
      { keys: ["k", "↑"], description: "Previous article" },
      { keys: ["u"], description: "Next feed" },
      { keys: ["i"], description: "Previous feed" },
      { keys: ["Space"], description: "Scroll article down" },
      { keys: ["["], description: "Toggle sidebar" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: [isMac ? "⌘K" : "Ctrl+K"], description: "Open command palette" },
      { keys: ["Enter"], description: "Add selected feed" },
      { keys: ["p"], description: "Preview feed" },
      { keys: ["o"], description: "Open original article" },
      { keys: ["h"], description: "Toggle full text view" },
      { keys: ["r"], description: "Refresh all feeds" },
      { keys: [isMac ? "⌘," : "Ctrl+,"], description: "Open settings" },
    ],
  },
  {
    title: "Explore",
    shortcuts: [
      { keys: ["n"], description: "Go to Explore" },
      { keys: ["/"], description: "Focus search" },
      { keys: ["Tab", "↓"], description: "Exit search into list" },
      { keys: ["1"], description: "Featured tab" },
      { keys: ["2"], description: "Topics tab" },
      { keys: ["3"], description: "Countries tab" },
      { keys: ["Esc"], description: "Deselect / clear search" },
    ],
  },
];

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 mt-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{shortcut.description}</span>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
