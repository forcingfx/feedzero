/**
 * Pre-import preview panel.
 *
 * Renders the parsed file's structure as a folder/feed tree so the
 * user sees exactly what's about to land in their library *before*
 * the addFeed loop modifies state. Three slots compose the panel:
 *
 *   ┌── Provenance line  (OPML head: "Imported from X's title")
 *   ├── Folder rows      (chevron + name + count + child feed titles)
 *   ├── Unfiled feeds    (when any feed sits outside a folder)
 *   └── Footer           (totals + Back / Confirm buttons)
 *
 * Non-OPML imports (URL lists, Pocket, Omnivore) only populate the
 * unfiled bucket — same component, fewer rows.
 */
import { ChevronDown, FolderClosed, Rss } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { OpmlHead } from "@/core/opml/opml-service";

export interface PreviewEntry {
  xmlUrl: string;
  title?: string;
  folderPath?: string[];
}

interface ImportPreviewProps {
  entries: PreviewEntry[];
  head?: OpmlHead | null;
  isImporting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

interface FolderGroup {
  name: string;
  /** Joined `/`-path used as the row key + data-testid. */
  pathKey: string;
  entries: PreviewEntry[];
}

function groupByFolder(entries: PreviewEntry[]): {
  folders: FolderGroup[];
  unfiled: PreviewEntry[];
} {
  const folders = new Map<string, FolderGroup>();
  const unfiled: PreviewEntry[] = [];
  for (const entry of entries) {
    const path = entry.folderPath;
    if (!path || path.length === 0) {
      unfiled.push(entry);
      continue;
    }
    const name = path[path.length - 1] ?? "";
    const pathKey = path.join("/");
    const existing = folders.get(pathKey);
    if (existing) {
      existing.entries.push(entry);
    } else {
      folders.set(pathKey, { name, pathKey, entries: [entry] });
    }
  }
  return { folders: Array.from(folders.values()), unfiled };
}

function formatProvenance(head?: OpmlHead | null): string | null {
  if (!head) return null;
  const parts: string[] = [];
  if (head.ownerName) parts.push(`from ${head.ownerName}`);
  if (head.title) parts.push(`"${head.title}"`);
  if (head.dateCreated) parts.push(`(${head.dateCreated})`);
  if (parts.length === 0) return null;
  return `Imported ${parts.join(" ")}`;
}

export function ImportPreview({
  entries,
  head,
  isImporting,
  onBack,
  onConfirm,
}: ImportPreviewProps) {
  const { folders, unfiled } = groupByFolder(entries);
  const provenance = formatProvenance(head ?? undefined);
  const totalFeeds = entries.length;

  return (
    <div className="space-y-4" data-testid="import-preview">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Ready to import</h3>
        <p className="text-xs text-muted-foreground">
          {folders.length === 0
            ? `${totalFeeds} feed${totalFeeds === 1 ? "" : "s"} will be added to your library.`
            : `${totalFeeds} feeds in ${folders.length} folder${folders.length === 1 ? "" : "s"} — your structure is preserved.`}
        </p>
        {provenance && (
          <p
            className="text-xs text-muted-foreground/80 italic"
            data-testid="preview-provenance"
          >
            {provenance}
          </p>
        )}
      </div>

      <div className="max-h-[340px] overflow-y-auto rounded-md border bg-muted/30 p-2 space-y-1">
        {folders.map((folder) => (
          <PreviewFolderRow key={folder.pathKey} folder={folder} />
        ))}
        {unfiled.length > 0 && (
          <div data-testid="preview-unfiled" className="space-y-0.5 pt-1">
            {folders.length > 0 && (
              <p className="px-2 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Unfiled
              </p>
            )}
            <ul>
              {unfiled.map((entry) => (
                <PreviewFeedRow key={entry.xmlUrl} entry={entry} />
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onBack} disabled={isImporting}>
          Back
        </Button>
        <Button onClick={onConfirm} disabled={isImporting}>
          Import {totalFeeds} feed{totalFeeds === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}

function PreviewFolderRow({ folder }: { folder: FolderGroup }) {
  const [open, setOpen] = useState(true);
  const count = folder.entries.length;
  return (
    <div data-testid={`preview-folder-${folder.name}`} className="space-y-0.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-sm hover:bg-muted/50"
        aria-expanded={open}
      >
        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
        <FolderClosed className="size-3.5 shrink-0 text-violet-500" />
        <span className="flex-1 truncate font-medium">{folder.name}</span>
        <span
          className="text-xs tabular-nums text-muted-foreground"
          aria-label={`${count} feeds`}
        >
          {count}
        </span>
      </button>
      {open && (
        <ul className="ml-5 border-l border-border/60 pl-2 space-y-0.5">
          {folder.entries.map((entry) => (
            <PreviewFeedRow key={entry.xmlUrl} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PreviewFeedRow({ entry }: { entry: PreviewEntry }) {
  const label = entry.title || entry.xmlUrl;
  return (
    <li className="flex items-center gap-2 rounded px-1.5 py-1 text-xs">
      <Rss className="size-3 shrink-0 text-muted-foreground/70" />
      <span className="truncate text-foreground/80">{label}</span>
    </li>
  );
}
