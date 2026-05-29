/**
 * Reading preferences — Settings → Reading tab.
 *
 * Folds in the reading-adjacent items that used to live in the sidebar
 * SettingsMenu dropdown:
 *   - Group article floods (toggle, persists via useAppStore)
 *   - Auto-organize feeds (button → existing AutoOrganizeDialog)
 *
 * AutoOrganize stays as its own modal — the multi-step flow wants its
 * own surface. Reading tab is the launcher.
 */
import { useState } from "react";
import { Layers, Wand2, Palette } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { useFeedStore } from "@/stores/feed-store";
import { AutoOrganizeDialog } from "@/components/folders/auto-organize-dialog";
import { ThemeToggle } from "../theme-toggle";
import { RulesAuditPanel } from "./rules-audit-panel";
import { SignalSection } from "../signal-section";

export function ReadingTab() {
  const groupArticleFloods = useAppStore((s) => s.groupArticleFloods);
  const setGroupArticleFloods = useAppStore((s) => s.setGroupArticleFloods);
  const hasFeeds = useFeedStore((s) => s.feeds.length > 0);
  const [autoOrganizeOpen, setAutoOrganizeOpen] = useState(false);

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium">Theme</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Light, dark, or follow your system.
        </p>
        <ThemeToggle />
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="size-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Group article floods</p>
              <p className="text-xs text-muted-foreground">
                Collapse runs of articles from the same feed posted close
                together so they don&apos;t crowd the timeline.
              </p>
            </div>
          </div>
          <Switch
            aria-label="Group article floods"
            checked={groupArticleFloods}
            onCheckedChange={(v) => setGroupArticleFloods(!!v)}
          />
        </div>
      </div>

      {hasFeeds && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Wand2 className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium">Auto-organize feeds</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Group your feeds into topic folders automatically. You can rename
            topics, add keywords, and remove ones that don&apos;t fit.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAutoOrganizeOpen(true)}
          >
            <Wand2 className="mr-2 size-4" />
            Auto-organize feeds…
          </Button>
        </div>
      )}

      <SignalSection />

      <RulesAuditPanel />

      <AutoOrganizeDialog
        open={autoOrganizeOpen}
        onOpenChange={setAutoOrganizeOpen}
      />
    </div>
  );
}
