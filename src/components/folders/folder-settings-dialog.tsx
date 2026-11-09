/**
 * Per-folder settings dialog. Opened from the floating cog when the
 * user is inside a folder view. Replaces the folder's sidebar
 * three-dot dropdown.
 *
 * Sections: Name, Color, Delete. Same shape as FeedSettingsDialog;
 * mounts at the app root and reads folderSettingsDialogId from
 * feed-store.
 */

import { useEffect, useState } from "react";
import { Folder as FolderIcon, Trash2, AlertTriangle } from "lucide-react";
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
import { FolderColorPicker } from "./folder-color-picker.tsx";
import type { Folder, OpenArticlesIn, SimilarityLevel } from "@feedzero/core/types";

export function FolderSettingsDialog() {
  const folderId = useFeedStore((s) => s.folderSettingsDialogId);
  const close = useFeedStore((s) => s.closeFolderSettings);
  const folders = useFeedStore((s) => s.folders);
  const folder = folders.find((f) => f.id === folderId);

  return (
    <Dialog
      open={Boolean(folderId)}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        data-testid="folder-settings-dialog"
        className="max-w-lg max-h-[85vh] overflow-y-auto"
      >
        {folder ? <Body folder={folder} onClose={close} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({ folder, onClose }: { folder: Folder; onClose: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FolderIcon className="size-4 text-primary" />
          Settings — {folder.name}
        </DialogTitle>
        <DialogDescription>
          Rename, recolor, or delete this folder. Feeds inside the folder
          stay subscribed; they fall back to Unfiled if the folder is
          deleted.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <NameSection folder={folder} />
        <ColorSection folder={folder} />
        <OpenArticlesInSection folder={folder} />
        <CollapseSimilarSection folder={folder} />
        <DeleteSection folder={folder} onClose={onClose} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

const FOLDER_DEFAULT = "default";

/**
 * Per-folder override of Settings → Reading → Open articles in. A native
 * select, like the retention setting: three options, no extra component.
 */
function OpenArticlesInSection({ folder }: { folder: Folder }) {
  const setOpenArticlesIn = useFeedStore((s) => s.setFolderOpenArticlesIn);

  return (
    <section className="space-y-2">
      <Label htmlFor="folder-settings-open-articles-in">Open articles in</Label>
      <select
        id="folder-settings-open-articles-in"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={folder.openArticlesIn ?? FOLDER_DEFAULT}
        onChange={(e) => {
          const value = e.target.value;
          void setOpenArticlesIn(
            folder.id,
            value === FOLDER_DEFAULT ? undefined : (value as OpenArticlesIn),
          );
        }}
      >
        <option value={FOLDER_DEFAULT}>App default (Settings → Reading)</option>
        <option value="feed">Feed text</option>
        <option value="full-text">Full text</option>
      </select>
      <p className="text-xs text-muted-foreground">
        Applies to every feed in this folder and its subfolders.
      </p>
    </section>
  );
}

const COLLAPSE_OFF = "off";

/**
 * Per-folder "Collapse similar stories" (issue #343). Several feeds in a
 * news folder often run one story with small title changes; this folds
 * them under the newest copy in the folder's article list.
 */
function CollapseSimilarSection({ folder }: { folder: Folder }) {
  const setCollapseSimilar = useFeedStore((s) => s.setFolderCollapseSimilar);

  return (
    <section className="space-y-2">
      <Label htmlFor="folder-settings-collapse-similar">Collapse similar stories</Label>
      <select
        id="folder-settings-collapse-similar"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={folder.collapseSimilar ?? COLLAPSE_OFF}
        onChange={(e) => {
          const value = e.target.value;
          void setCollapseSimilar(
            folder.id,
            value === COLLAPSE_OFF ? undefined : (value as SimilarityLevel),
          );
        }}
      >
        <option value={COLLAPSE_OFF}>Off</option>
        <option value="loose">Loose (titles share about 40% of their words)</option>
        <option value="normal">Normal (about 60%)</option>
        <option value="strict">Strict (about 80%)</option>
      </select>
      <p className="text-xs text-muted-foreground">
        Near-identical headlines from this folder's feeds fold under the newest copy.
        Opening it marks the folded copies read. Applies to subfolders too.
      </p>
    </section>
  );
}

function NameSection({ folder }: { folder: Folder }) {
  const renameFolder = useFeedStore((s) => s.renameFolder);
  const [draft, setDraft] = useState(folder.name);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(folder.name);
  }, [folder.name]);

  const dirty = draft.trim().length > 0 && draft.trim() !== folder.name;

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      await renameFolder(folder.id, draft.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-2">
      <Label htmlFor="folder-settings-name">Name</Label>
      <div className="flex items-center gap-2">
        <Input
          id="folder-settings-name"
          data-testid="folder-settings-name-input"
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
          data-testid="folder-settings-name-save"
        >
          Save
        </Button>
      </div>
    </section>
  );
}

function ColorSection({ folder }: { folder: Folder }) {
  const updateFolderColor = useFeedStore((s) => s.updateFolderColor);

  return (
    <section className="space-y-2">
      <Label>Color</Label>
      <div className="rounded-md border bg-card p-3">
        <FolderColorPicker
          value={folder.color}
          onChange={(color) => updateFolderColor(folder.id, color)}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Click a swatch to set the folder's accent. Click again to clear.
        </p>
      </div>
    </section>
  );
}

function DeleteSection({
  folder,
  onClose,
}: {
  folder: Folder;
  onClose: () => void;
}) {
  const deleteFolder = useFeedStore((s) => s.deleteFolder);

  return (
    <section className="space-y-2">
      <Label>Danger zone</Label>
      <div className="rounded-md border bg-card p-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              data-testid="folder-settings-delete"
            >
              <Trash2 className="size-4" /> Delete folder
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-destructive" />
                Delete this folder?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {folder.name} will be removed. Feeds that were inside it
                stay subscribed but become Unfiled.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="folder-settings-delete-cancel">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                data-testid="folder-settings-delete-confirm"
                onClick={async () => {
                  await deleteFolder(folder.id);
                  onClose();
                }}
              >
                Delete folder
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
