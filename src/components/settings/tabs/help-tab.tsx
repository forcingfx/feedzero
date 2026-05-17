/**
 * Help / about — Settings → Help tab.
 *
 * Folds in the help-adjacent items that used to live in the sidebar
 * SettingsMenu dropdown:
 *   - Keyboard shortcuts (inline list — KeyboardShortcutsDialog deleted)
 *   - Send feedback (button → existing FeedbackDialog)
 *   - What's new (button → calls onWhatsNew prop, which navigates to or
 *     subscribes to the changelog feed)
 */
import { useState } from "react";
import { Keyboard, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";
import { ContactSupport } from "@/components/settings/contact-support";
import { getLicenseToken } from "@/core/license/license-token-store";

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

interface HelpTabProps {
  onWhatsNew: () => void;
}

export function HelpTab({ onWhatsNew }: HelpTabProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const token = getLicenseToken();

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Keyboard className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium">Keyboard shortcuts</p>
        </div>
        <div className="space-y-4">
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
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setFeedbackOpen(true)}
        >
          <MessageSquare className="mr-2 size-4" />
          Send feedback
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onWhatsNew}
        >
          <Sparkles className="mr-2 size-4" />
          What&apos;s new
        </Button>
      </div>

      <ContactSupport
        token={token}
        diagnosticContext={{ Source: "settings-help" }}
      />

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </div>
  );
}
