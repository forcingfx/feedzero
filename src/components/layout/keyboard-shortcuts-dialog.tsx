import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { ShortcutGroupsList } from "./shortcut-groups-list.tsx";
import { useShortcutsDialogStore } from "@/stores/shortcuts-dialog-store.ts";

/**
 * The `?` overlay: a quick keyboard-shortcut reference, summonable from
 * anywhere via `?` (use-keyboard-nav) or the command palette's "Show
 * keyboard shortcuts" action. Self-subscribes to its store so callers
 * only need to flip state — mounted once in AppLayout.
 */
export function KeyboardShortcutsDialog() {
  const isOpen = useShortcutsDialogStore((s) => s.isOpen);
  const close = useShortcutsDialogStore((s) => s.close);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          <ShortcutGroupsList />
        </div>
      </DialogContent>
    </Dialog>
  );
}
