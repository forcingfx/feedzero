import { Settings as SettingsIcon } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import { ExpandingPill } from "@/components/ui/expanding-pill.tsx";
import {
  ALL_FEEDS_ID,
  STARRED_FEED_ID,
  isFolderFeedId,
  fromFolderFeedId,
  isFilterFeedId,
  fromFilterFeedId,
} from "@feedzero/core/utils/constants";

/**
 * Floating cog above the article list. Context-aware: clicks
 * dispatch to the right settings dialog based on the current
 * selectedFeedId type. Hides itself on aggregated views that have
 * nothing to configure (ALL_FEEDS, STARRED) and on broken
 * references (folder/filter whose target was deleted).
 */
export function SettingsPill() {
  const { target, open } = useSettingsTarget();

  if (!target) return null;

  return (
    <ExpandingPill
      icon={<SettingsIcon />}
      label={target.label}
      aria-label={target.label}
      dataTestId="settings-pill"
      onClick={open}
    />
  );
}

/**
 * Context-aware settings dispatch for the current view. `target` is
 * null on aggregated views with nothing to configure (All / Starred)
 * and on broken references; `open` routes to the matching dialog.
 * Shared by the desktop SettingsPill and the mobile ViewOptionsPill so
 * both surfaces agree on what "settings for this view" means.
 */
export function useSettingsTarget(): {
  target: Target | null;
  open: () => void;
} {
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const feeds = useFeedStore((s) => s.feeds);
  const folders = useFeedStore((s) => s.folders);
  const openFeedSettings = useFeedStore((s) => s.openFeedSettings);
  const openFolderSettings = useFeedStore((s) => s.openFolderSettings);
  const filters = useSmartFilterStore((s) => s.filters);
  const openEditor = useSmartFilterStore((s) => s.openEditor);

  const target = resolveTarget({
    selectedFeedId,
    feeds,
    folders,
    filters,
  });

  function open() {
    if (!target) return;
    switch (target.kind) {
      case "feed":
        openFeedSettings(target.id);
        return;
      case "folder":
        openFolderSettings(target.id);
        return;
      case "filter":
        openEditor(target.filter);
        return;
    }
  }

  return { target, open };
}

type Target =
  | { kind: "feed"; id: string; label: string }
  | { kind: "folder"; id: string; label: string }
  | {
      kind: "filter";
      filter: import("@feedzero/core/types").SmartFilter;
      label: string;
    };

function resolveTarget({
  selectedFeedId,
  feeds,
  folders,
  filters,
}: {
  selectedFeedId: string | null;
  feeds: import("@feedzero/core/types").Feed[];
  folders: import("@feedzero/core/types").Folder[];
  filters: import("@feedzero/core/types").SmartFilter[];
}): Target | null {
  if (!selectedFeedId) return null;
  if (selectedFeedId === ALL_FEEDS_ID) return null;
  if (selectedFeedId === STARRED_FEED_ID) return null;

  if (isFolderFeedId(selectedFeedId)) {
    const id = fromFolderFeedId(selectedFeedId);
    if (!id) return null;
    const folder = folders.find((f) => f.id === id);
    if (!folder) return null;
    return { kind: "folder", id, label: "Folder settings" };
  }

  if (isFilterFeedId(selectedFeedId)) {
    const id = fromFilterFeedId(selectedFeedId);
    if (!id) return null;
    const filter = filters.find((f) => f.id === id);
    if (!filter) return null;
    return { kind: "filter", filter, label: "Edit filter" };
  }

  const feed = feeds.find((f) => f.id === selectedFeedId);
  if (!feed) return null;
  return { kind: "feed", id: selectedFeedId, label: "Feed settings" };
}
