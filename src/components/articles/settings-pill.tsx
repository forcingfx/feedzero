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
} from "@/utils/constants.ts";

/**
 * Floating cog above the article list. Context-aware: clicks
 * dispatch to the right settings dialog based on the current
 * selectedFeedId type. Hides itself on aggregated views that have
 * nothing to configure (ALL_FEEDS, STARRED) and on broken
 * references (folder/filter whose target was deleted).
 */
export function SettingsPill() {
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

  if (!target) return null;

  function handleClick() {
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

  return (
    <ExpandingPill
      icon={<SettingsIcon />}
      label={target.label}
      aria-label={target.label}
      dataTestId="settings-pill"
      onClick={handleClick}
    />
  );
}

type Target =
  | { kind: "feed"; id: string; label: string }
  | { kind: "folder"; id: string; label: string }
  | {
      kind: "filter";
      filter: import("@/types/index.ts").SmartFilter;
      label: string;
    };

function resolveTarget({
  selectedFeedId,
  feeds,
  folders,
  filters,
}: {
  selectedFeedId: string | null;
  feeds: import("@/types/index.ts").Feed[];
  folders: import("@/types/index.ts").Folder[];
  filters: import("@/types/index.ts").SmartFilter[];
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
