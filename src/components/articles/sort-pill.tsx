import { ArrowUpDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { ExpandingPill } from "@/components/ui/expanding-pill.tsx";
import type { ArticleSortMode } from "@/types/index.ts";
import { ARTICLE_SORT_MODES } from "@/types/index.ts";

const SORT_LABELS: Record<ArticleSortMode, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  "unread-first": "Unread first",
};

interface SortPillProps {
  mode: ArticleSortMode;
  onChange: (mode: ArticleSortMode) => void;
  dataTestId?: string;
}

/**
 * Article-list sort selector built on the ExpandingPill primitive.
 * Icon-only on every viewport; expands on hover (desktop), focus
 * (keyboard), or press (mobile tap).
 */
export function SortPill({ mode, onChange, dataTestId }: SortPillProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ExpandingPill
          icon={<ArrowUpDown />}
          label={SORT_LABELS[mode]}
          aria-label={`Sort: ${SORT_LABELS[mode]}`}
          dataTestId={dataTestId}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {ARTICLE_SORT_MODES.map((m) => (
          <DropdownMenuItem key={m} onClick={() => onChange(m)}>
            <Check
              className={`size-3.5 mr-1.5 ${
                mode === m ? "opacity-100" : "opacity-0"
              }`}
            />
            {SORT_LABELS[m]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
