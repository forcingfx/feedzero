import { Check, SlidersHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { ExpandingPill } from "@/components/ui/expanding-pill.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useSettingsTarget } from "./settings-pill.tsx";
import { ARTICLE_SORT_MODES } from "@feedzero/core/types";
import type { ArticleSortMode } from "@feedzero/core/types";

const SORT_LABELS: Record<ArticleSortMode, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  "unread-first": "Unread first",
};

/**
 * The mobile header's single control: one menu holding everything that
 * configures the current view — sort order plus the contextual
 * feed/folder/filter settings entry. Replaces the previous row of
 * three same-looking pills whose scopes silently differed (refresh
 * action / feed settings / list sort); refresh belongs to the
 * pull-to-refresh gesture on mobile.
 */
export function ViewOptionsPill() {
  const sortMode = useArticleStore((s) => s.articleSortMode);
  const setSortMode = useArticleStore((s) => s.setArticleSortMode);
  const { target, open } = useSettingsTarget();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ExpandingPill
          icon={<SlidersHorizontal />}
          label="View options"
          aria-label="View options"
          dataTestId="view-options-pill"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {ARTICLE_SORT_MODES.map((m) => (
          <DropdownMenuItem key={m} onClick={() => setSortMode(m)}>
            <Check
              className={`size-3.5 mr-1.5 ${
                sortMode === m ? "opacity-100" : "opacity-0"
              }`}
            />
            {SORT_LABELS[m]}
          </DropdownMenuItem>
        ))}
        {target && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={open}>{target.label}…</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
