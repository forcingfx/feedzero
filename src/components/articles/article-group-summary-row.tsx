import { ChevronDown, ChevronUp } from "lucide-react";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { cn } from "@/lib/utils.ts";

interface ArticleGroupSummaryRowProps {
  /** Whether the group is currently expanded. Drives the label + icon. */
  open: boolean;
  /**
   * Number of hidden articles when collapsed (group size minus the
   * always-visible top article). Used for the "+N more" label.
   */
  hiddenCount: number;
  /** Feed title for aggregated views; falls back to "this feed". */
  feedTitle?: string;
  /** Feed siteUrl used to render the favicon next to the feed title. */
  feedSiteUrl?: string;
  onToggle: () => void;
}

/**
 * A single list row that summarises a same-feed flood of articles. When
 * collapsed: "Show N more from <feed>" with a down chevron. When open:
 * "Collapse" with an up chevron. Clicking the row toggles the group's
 * expansion state (state lives in ArticleList).
 *
 * Deliberately NOT role="option" — keyboard nav (j/k) targets only
 * role="option" elements (i.e. articles). Summary rows are interactive
 * via mouse / Tab + Enter only, so j/k skips them and walks article to
 * article instead of pausing on the toggle.
 */
export function ArticleGroupSummaryRow({
  open,
  hiddenCount,
  feedTitle,
  feedSiteUrl,
  onToggle,
}: ArticleGroupSummaryRowProps) {
  const label = feedTitle ?? "this feed";
  const ariaLabel = open
    ? `Collapse group from ${label}`
    : `Show ${hiddenCount} more articles from ${label}`;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={ariaLabel}
      aria-expanded={open}
      className={cn(
        "flex w-full items-center justify-center gap-1.5",
        "min-h-11 px-3 py-2 text-xs text-muted-foreground",
        "border-b border-border bg-muted/30",
        "hover:bg-accent/60 hover:text-foreground",
        "active:scale-[0.99] transition-colors duration-150",
        "cursor-pointer",
      )}
    >
      {open ? (
        <>
          Collapse
          <ChevronUp className="size-3" />
        </>
      ) : (
        <>
          Show {hiddenCount} more from{" "}
          {feedSiteUrl && (
            <FeedFavicon
              siteUrl={feedSiteUrl}
              className="size-3.5 shrink-0"
            />
          )}
          <span className="font-medium text-foreground/80">{label}</span>
          <ChevronDown className="size-3" />
        </>
      )}
    </button>
  );
}
