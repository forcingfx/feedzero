/**
 * Help / about — Settings → Help tab.
 *
 * Folds in the help-adjacent items that used to live in the sidebar
 * SettingsMenu dropdown:
 *   - Keyboard shortcuts (shared ShortcutGroupsList — same single
 *     source as the `?` overlay, see lib/keyboard-shortcuts.ts)
 *   - Send feedback (button → existing FeedbackDialog)
 *   - What's new (button → calls onWhatsNew prop, which navigates to or
 *     subscribes to the changelog feed)
 */
import { useState } from "react";
import { Keyboard, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";
import { ShortcutGroupsList } from "@/components/layout/shortcut-groups-list";
import { ContactSupport } from "@/components/settings/contact-support";
import { PreflightPanel } from "@/components/settings/preflight-panel";
import { getLicenseToken } from "@/core/license/license-token-store";
import { isSelfHosted } from "@/core/features/self-hosted";
import { runSelfHostPreflight } from "@/core/diagnostics/self-host-preflight";
import { getAppVersion } from "@/core/version";

interface HelpTabProps {
  onWhatsNew: () => void;
}

export function HelpTab({ onWhatsNew }: HelpTabProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const token = getLicenseToken();
  const version = getAppVersion();

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Keyboard className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium">Keyboard shortcuts</p>
        </div>
        <ShortcutGroupsList />
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
        diagnosticContext={{ Source: "settings-help", Version: version }}
      />

      <p
        data-testid="app-version"
        className="text-center text-xs text-muted-foreground"
      >
        FeedZero v{version}
      </p>

      {isSelfHosted() ? (
        <PreflightPanel
          runPreflight={() =>
            runSelfHostPreflight({
              isSecureContext: globalThis.isSecureContext ?? false,
              crypto: globalThis.crypto as Pick<Crypto, "subtle"> | undefined,
              fetch: globalThis.fetch.bind(globalThis),
              origin: window.location.origin,
            })
          }
        />
      ) : null}

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </div>
  );
}
