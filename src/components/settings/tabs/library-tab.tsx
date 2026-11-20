/**
 * Settings → Library: how long articles are kept and how feeds are
 * organised and filtered. AutoOrganize stays its own modal; this tab is
 * the launcher.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useFeedStore } from "@/stores/feed-store";
import { AutoOrganizeDialog } from "@/components/folders/auto-organize-dialog";
import { RulesAuditPanel } from "./rules-audit-panel";
import { ArticleRetentionSetting } from "../article-retention-setting";
import { SettingRow, SettingsGroup } from "../setting-row";

export function LibraryTab() {
  const hasFeeds = useFeedStore((s) => s.feeds.length > 0);
  const [autoOrganizeOpen, setAutoOrganizeOpen] = useState(false);

  return (
    <div data-testid="library-tab" className="space-y-8 py-2">
      <SettingsGroup title="Library">
        <ArticleRetentionSetting />
        {hasFeeds && (
          <SettingRow
            label="Auto-organize feeds"
            description="Group your feeds into topic folders. You can rename topics, add keywords, and remove ones that don't fit."
          >
            <Button type="button" variant="outline" size="sm" onClick={() => setAutoOrganizeOpen(true)}>
              Auto-organize…
            </Button>
          </SettingRow>
        )}
        <RulesAuditPanel />
      </SettingsGroup>

      <AutoOrganizeDialog open={autoOrganizeOpen} onOpenChange={setAutoOrganizeOpen} />
    </div>
  );
}
