import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils.ts";

interface SimilarStoriesRowProps {
  open: boolean;
  /** Copies folded under the lead article above this row. */
  hiddenCount: number;
  onToggle: () => void;
}

/**
 * The row under a lead article whose near-duplicates are folded away
 * ("Collapse similar stories", issue #343). Same contract as
 * ArticleGroupSummaryRow: a plain button, deliberately not role="option",
 * so j/k keyboard navigation walks article to article and skips it.
 */
export function SimilarStoriesRow({ open, hiddenCount, onToggle }: SimilarStoriesRowProps) {
  const noun = hiddenCount === 1 ? "source" : "sources";
  const ariaLabel = open
    ? "Collapse similar stories"
    : `Show ${hiddenCount} similar ${hiddenCount === 1 ? "story" : "stories"} from other sources`;

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
          Also in <span className="font-medium text-foreground/80">{hiddenCount} more {noun}</span>
          <ChevronDown className="size-3" />
        </>
      )}
    </button>
  );
}
