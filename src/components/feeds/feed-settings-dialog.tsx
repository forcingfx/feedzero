/**
 * Per-feed settings dialog. Opened from the floating cog above the
 * article list (replaces the per-feed three-dot sidebar dropdown).
 *
 * Sections, in order: Name, Display (prefer/prefetch full text),
 * Folder, Rules (link to RulesEditorDialog), Actions (refresh,
 * clear cached, delete).
 *
 * State: open/close lives on feed-store (feedSettingsDialogId). The
 * target feed is read from feed-store.feeds. Mutations go straight
 * to the existing store actions — this component is a controlled
 * shell around them.
 */

import { useEffect, useState } from "react";
import {
  Settings2,
  RefreshCw,
  RotateCcw,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { useFeatureGate } from "@/hooks/use-feature-gate.ts";
import { TierLockBadge } from "@/components/features/tier-lock-badge.tsx";
import type { Feature } from "@/core/features/feature-gates.ts";
import type { Feed } from "@/types/index.ts";

export function FeedSettingsDialog() {
  const feedId = useFeedStore((s) => s.feedSettingsDialogId);
  const close = useFeedStore((s) => s.closeFeedSettings);
  const feeds = useFeedStore((s) => s.feeds);
  const feed = feeds.find((f) => f.id === feedId);

  return (
    <Dialog
      open={Boolean(feedId)}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        data-testid="feed-settings-dialog"
        className="max-w-lg max-h-[85vh] overflow-y-auto"
        // Don't yank focus into the Name field on open. Radix autofocuses
        // the first focusable element by default, which pops the mobile
        // keyboard and frames the dialog as a rename form. Let focus rest
        // on the dialog container instead.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {feed ? <Body feed={feed} onClose={close} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({ feed, onClose }: { feed: Feed; onClose: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Settings2 className="size-4 text-violet-500" />
          Settings — {feed.title}
        </DialogTitle>
        <DialogDescription>
          Configure how this feed is fetched, displayed, and organised.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <NameSection feed={feed} />
        <DisplaySection feed={feed} />
        <FolderSection feed={feed} />
        <RulesSection feed={feed} />
        <ActionsSection feed={feed} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

function NameSection({ feed }: { feed: Feed }) {
  const renameFeed = useFeedStore((s) => s.renameFeed);
  const [draft, setDraft] = useState(feed.title);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(feed.title);
  }, [feed.title]);

  const dirty = draft.trim().length > 0 && draft.trim() !== feed.title;

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      await renameFeed(feed.id, draft.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-2">
      <Label htmlFor="feed-settings-name">Name</Label>
      <div className="flex items-center gap-2">
        <Input
          id="feed-settings-name"
          data-testid="feed-settings-name-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={save}
          disabled={!dirty || saving}
          data-testid="feed-settings-name-save"
        >
          Save
        </Button>
      </div>
    </section>
  );
}

function DisplaySection({ feed }: { feed: Feed }) {
  const setFeedPreferFullText = useFeedStore((s) => s.setFeedPreferFullText);
  const setFeedPrefetchEnabled = useFeedStore((s) => s.setFeedPrefetchEnabled);

  return (
    <section className="space-y-3">
      <Label>Display</Label>
      <div className="space-y-3 rounded-md border bg-card p-3">
        <ToggleRow
          id="feed-settings-prefer-full-text"
          label="Prefer full text"
          description="Open articles from this feed in extracted-text view by default."
          checked={Boolean(feed.preferFullText)}
          onCheckedChange={(v) => setFeedPreferFullText(feed.id, v)}
        />
        <ToggleRow
          id="feed-settings-prefetch"
          label="Prefetch full text"
          description="Pre-extract this feed's recent articles on refresh so they read offline."
          checked={Boolean(feed.prefetchEnabled)}
          onCheckedChange={(v) => setFeedPrefetchEnabled(feed.id, v)}
          lockFeature="offline-prefetch"
        />
      </div>
    </section>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  lockFeature,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  /** When set and the feature is gate-locked, the switch is disabled and a
   *  TierLockBadge routes to the upgrade affordance. Matrix-derived. */
  lockFeature?: Feature;
}) {
  const gate = useFeatureGate(lockFeature ?? "signal");
  const locked = lockFeature !== undefined && !gate.enabled;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {locked && lockFeature ? <TierLockBadge feature={lockFeature} /> : null}
        <Switch
          id={id}
          data-testid={id}
          checked={checked && !locked}
          disabled={locked}
          onCheckedChange={onCheckedChange}
        />
      </div>
    </div>
  );
}

function FolderSection({ feed }: { feed: Feed }) {
  const folders = useFeedStore((s) => s.folders);
  const moveFeedToFolder = useFeedStore((s) => s.moveFeedToFolder);

  return (
    <section className="space-y-2">
      <Label htmlFor="feed-settings-folder">Folder</Label>
      <select
        id="feed-settings-folder"
        data-testid="feed-settings-folder"
        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        value={feed.folderId ?? ""}
        onChange={(e) =>
          moveFeedToFolder(feed.id, e.target.value === "" ? null : e.target.value)
        }
      >
        <option value="">Unfiled</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </section>
  );
}

function RulesSection({ feed }: { feed: Feed }) {
  const openRulesEditor = useFeedStore((s) => s.openRulesEditor);
  const gate = useFeatureGate("rules");
  const ruleCount = feed.rules?.length ?? 0;

  // Gate at the entry point: a locked user gets routed to upgrade instead
  // of building a rule they can't save. Mirrors the filters / auto-organize
  // pattern. Self-hosters and pre-launch builds pass through via gate.enabled.
  const handleManage = gate.enabled
    ? () => openRulesEditor(feed.id)
    : gate.promptUpgrade;

  return (
    <section className="space-y-2">
      <Label>Rules</Label>
      <div className="flex items-center justify-between gap-2 rounded-md border bg-card p-3">
        <p className="text-sm text-muted-foreground">
          {ruleCount === 0
            ? "No rules. Auto-mute, star, or route articles."
            : `${ruleCount} rule${ruleCount === 1 ? "" : "s"} active.`}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <TierLockBadge feature="rules" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="feed-settings-manage-rules"
            onClick={handleManage}
          >
            Manage rules…
          </Button>
        </div>
      </div>
    </section>
  );
}

function ActionsSection({ feed }: { feed: Feed }) {
  const refreshSingleFeed = useFeedStore((s) => s.refreshSingleFeed);
  const reloadSingleFeed = useFeedStore((s) => s.reloadSingleFeed);
  const removeFeed = useFeedStore((s) => s.removeFeed);
  const close = useFeedStore((s) => s.closeFeedSettings);

  return (
    <section className="space-y-2">
      <Label>Actions</Label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="feed-settings-refresh"
          onClick={() => refreshSingleFeed(feed.id)}
        >
          <RefreshCw className="size-4" /> Refresh now
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="feed-settings-clear-cache"
          onClick={() => reloadSingleFeed(feed.id)}
        >
          <RotateCcw className="size-4" /> Clear cached articles
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              data-testid="feed-settings-delete"
            >
              <Trash2 className="size-4" /> Delete feed
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-destructive" />
                Delete this feed?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {feed.title} and every cached article from it will be removed.
                This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="feed-settings-delete-cancel">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                data-testid="feed-settings-delete-confirm"
                onClick={async () => {
                  await removeFeed(feed.id);
                  close();
                }}
              >
                Delete feed
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
