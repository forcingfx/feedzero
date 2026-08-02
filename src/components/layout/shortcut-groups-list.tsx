import { Kbd } from "@/components/ui/kbd.tsx";
import { SHORTCUT_GROUPS } from "@/lib/keyboard-shortcuts.ts";

/**
 * Shared renderer for the keyboard-shortcut reference. Used by the `?`
 * overlay and Settings → Help so both surfaces show the exact same
 * single-source content.
 */
export function ShortcutGroupsList() {
  return (
    <div className="space-y-5">
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
  );
}
