import { ArrowUpDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { HeaderAction } from "./header-action.tsx";
import type { ArticleSortMode } from "@feedzero/core/types";
import { ARTICLE_SORT_MODES } from "@feedzero/core/types";

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
 * Article-list sort selector: an icon action whose accessible name and
 * tooltip state the current mode, opening a menu of all modes.
 */
export function SortPill({ mode, onChange, dataTestId }: SortPillProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <HeaderAction label={`Sort: ${SORT_LABELS[mode]}`} data-testid={dataTestId}>
          <ArrowUpDown className="size-4" />
        </HeaderAction>
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
