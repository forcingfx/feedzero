/**
 * Quick-tag dialog. Opens via either:
 *   - ⌘K palette → "Tag this feed…"
 *   - `t` keyboard shortcut (with a concrete feed selected)
 *
 * Lightweight modal — just the feed title + TagPicker + Save. Same
 * `setFeedTags` store action that powers the in-dialog editor, so
 * the two paths are interchangeable from the user's perspective.
 *
 * Distinct from the full feed-settings dialog so the user can tag
 * without losing read context (the article list / reader stay
 * mounted; this is a narrow overlay).
 */

import { useEffect, useState } from "react";
import { Tag } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { TagPicker } from "./tag-picker.tsx";

export function TagQuickDialog() {
  const feedId = useFeedStore((s) => s.tagQuickDialogFeedId);
  const close = useFeedStore((s) => s.closeTagQuickDialog);
  const feeds = useFeedStore((s) => s.feeds);
  const setFeedTags = useFeedStore((s) => s.setFeedTags);
  const feed = feeds.find((f) => f.id === feedId);

  return (
    <Dialog
      open={Boolean(feedId)}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        data-testid="tag-quick-dialog"
        className="max-w-md"
        // Don't pop the mobile keyboard the instant we mount.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {feed ? (
          <Body
            key={feed.id}
            feedId={feed.id}
            feedTitle={feed.title}
            initialTags={feed.tags ?? []}
            onSave={(tags) => setFeedTags(feed.id, tags)}
            onClose={close}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  feedId,
  feedTitle,
  initialTags,
  onSave,
  onClose,
}: {
  feedId: string;
  feedTitle: string;
  initialTags: string[];
  onSave: (tags: string[]) => Promise<void>;
  onClose: () => void;
}) {
  // `key={feedId}` on Body resets local state when the target feed
  // changes; that keeps `draft` simple and avoids the stale-cache
  // class of bugs.
  const [draft, setDraft] = useState<string[]>(initialTags);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(initialTags);
  }, [initialTags]);

  const dirty =
    draft.length !== initialTags.length ||
    draft.some((t, i) => t !== initialTags[i]);

  async function save() {
    if (!dirty) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Tag className="size-4 text-violet-500" />
          Tag — {feedTitle}
        </DialogTitle>
        <DialogDescription>
          Add or remove tags. Existing tags suggest as you type.
        </DialogDescription>
      </DialogHeader>

      <div className="py-2">
        <TagPicker
          value={draft}
          onChange={setDraft}
          data-testid="tag-quick-dialog-picker"
        />
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          data-testid="tag-quick-dialog-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          data-testid="tag-quick-dialog-save"
        >
          Save
        </Button>
      </DialogFooter>
      {/* Hidden helper so tests can read which feed this dialog opened against */}
      <span data-testid="tag-quick-dialog-feed-id" className="sr-only">
        {feedId}
      </span>
    </>
  );
}
