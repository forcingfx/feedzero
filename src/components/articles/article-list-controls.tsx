import { SortPill } from "./sort-pill.tsx";
import { SettingsPill } from "./settings-pill.tsx";
import type { ArticleSortMode } from "@/types/index.ts";

/**
 * Sticky header inside the article-list scroll container. Hosts the
 * floating control pills (sort + settings cog). Right-aligned flex
 * row with a gap so pills can sit side-by-side without overlapping;
 * each expands independently on hover.
 *
 * The container itself is `pointer-events-none` so the area between
 * pills stays scroll-friendly; the pills opt back into pointer events.
 *
 * SettingsPill is added in a later commit — context-aware (hides on
 * aggregated views) and routes the cog click to the right dialog.
 */
interface ArticleListControlsProps {
  sortMode: ArticleSortMode;
  onSortChange: (mode: ArticleSortMode) => void;
}

export function ArticleListControls({
  sortMode,
  onSortChange,
}: ArticleListControlsProps) {
  return (
    <div
      data-testid="article-list-controls"
      className="sticky top-0 z-10 flex justify-end items-center gap-2 px-2 py-1 bg-background/80 backdrop-blur-sm pointer-events-none"
    >
      <SettingsPill />
      <SortPill mode={sortMode} onChange={onSortChange} />
    </div>
  );
}
