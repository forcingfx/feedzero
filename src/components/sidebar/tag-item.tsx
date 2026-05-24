import { Tag } from "lucide-react";
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";

interface TagItemProps {
  tag: string;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * Sidebar row representing the aggregated view across every feed
 * tagged with `tag`. Parallels FolderItem in shape but simpler — no
 * collapsible child list, no drag-and-drop, just a label + unread
 * count. Tags themselves are derived from `Feed.tags` (populated
 * from OPML outline[category]); editing a feed's tags happens in
 * the feed-settings dialog.
 */
export function TagItem({ tag, isSelected, onSelect }: TagItemProps) {
  // Compute the unread count by walking every feed whose tags include
  // this label. Same shape as folder-aggregated count.
  const unreadCount = useArticleStore((s) => {
    const feeds = useFeedStore.getState().feeds;
    const taggedFeedIds = new Set(
      feeds.filter((f) => (f.tags ?? []).includes(tag)).map((f) => f.id),
    );
    let count = 0;
    for (const [feedId, list] of Object.entries(s.articlesByFeedId)) {
      if (!taggedFeedIds.has(feedId)) continue;
      for (const a of list) if (!a.read && !a.muted) count++;
    }
    return count;
  });

  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={isSelected} onClick={onSelect}>
        <Tag className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{tag}</span>
        {unreadCount > 0 && (
          <SidebarMenuBadge>{unreadCount}</SidebarMenuBadge>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
