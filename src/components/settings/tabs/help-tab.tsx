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
import { Button } from "@/components/ui/button";
import { SettingRow, SettingsGroup } from "@/components/settings/setting-row";
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
    <div className="space-y-8 py-2">
      <SettingsGroup title="Keyboard shortcuts">
        <div className="py-3">
          <ShortcutGroupsList />
        </div>
      </SettingsGroup>

      <SettingsGroup title="Feedback">
        <SettingRow label="Send feedback" description="A short form; it files an issue for us to read.">
          <Button type="button" variant="outline" size="sm" onClick={() => setFeedbackOpen(true)}>
            Send feedback
          </Button>
        </SettingRow>
        <SettingRow label="What's new" description="Release notes, as a feed you can follow.">
          <Button type="button" variant="outline" size="sm" onClick={onWhatsNew}>
            What&apos;s new
          </Button>
        </SettingRow>
      </SettingsGroup>

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
