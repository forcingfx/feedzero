import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["J"], description: "Next article" },
      { keys: ["K"], description: "Previous article" },
      { keys: ["U"], description: "Previous feed" },
      { keys: ["I"], description: "Next feed" },
      { keys: ["["], description: "Toggle sidebar" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: ["O"], description: "Open original article" },
      { keys: ["E"], description: "Toggle extracted view" },
      { keys: ["N"], description: "Add new feed" },
      { keys: ["R"], description: "Refresh all feeds" },
    ],
  },
  {
    title: "Explore",
    shortcuts: [
      { keys: ["/"], description: "Focus search" },
      { keys: ["1"], description: "Featured tab" },
      { keys: ["2"], description: "Topics tab" },
      { keys: ["3"], description: "Countries tab" },
      { keys: ["Esc"], description: "Clear search" },
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
