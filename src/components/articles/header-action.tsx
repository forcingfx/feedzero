import * as React from "react";
import { Button } from "@/components/ui/button.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { cn } from "@/lib/utils";

interface HeaderActionProps
  extends Omit<React.ComponentProps<typeof Button>, "children" | "variant" | "size"> {
  /** Accessible name and tooltip text. */
  label: string;
  children: React.ReactNode;
}

/**
 * One icon action in a title bar: a ghost icon button with a tooltip.
 * The same shape every other icon action in the app uses (sidebar
 * header, reader toolbar), so the article-list title bar stops being
 * the one surface with its own button vocabulary.
 *
 * Forwards the ref so it can sit inside a Radix `DropdownMenuTrigger`.
 */
export const HeaderAction = React.forwardRef<HTMLButtonElement, HeaderActionProps>(
  function HeaderAction({ label, className, children, ...rest }, ref) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            className={cn("size-8 text-muted-foreground hover:text-foreground", className)}
            {...rest}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    );
  },
);
