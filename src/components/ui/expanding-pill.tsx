import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Circle-to-pill button. Default state is a circular icon-only button;
 * hover (desktop) or keyboard focus-visible expands the label slot via
 * a CSS `max-width` animation, growing the pill rightward without
 * shifting the icon. Set `alwaysExpanded` for the mobile path where
 * hover doesn't apply.
 *
 * Pattern is new for this codebase — see the cog/sort floating pills
 * at the top of the article list for the primary consumers. Keep the
 * primitive presentational; routing, store reads, and dialog dispatch
 * happen in the wrapper component (SortPill, SettingsPill).
 *
 * Accessibility:
 * - Always renders as a real <button>, so keyboard activation works
 *   out of the box.
 * - aria-label is forwarded; pass a description (e.g. "Open feed
 *   settings") that makes sense even when the label is collapsed.
 * - The label text stays in the DOM at all times so screen readers
 *   announce it; only its visual width is animated.
 */
export interface ExpandingPillProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: React.ReactNode;
  label: string;
  /**
   * When true, the label is visible at its full width without needing
   * a hover. Use on mobile (no hover semantics) and any always-on
   * affordance.
   */
  alwaysExpanded?: boolean;
  dataTestId?: string;
}

export const ExpandingPill = React.forwardRef<
  HTMLButtonElement,
  ExpandingPillProps
>(function ExpandingPill(
  { icon, label, alwaysExpanded = false, dataTestId, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      data-testid={dataTestId}
      className={cn(
        // Base shape: circle that grows into a pill as the label expands.
        "group inline-flex items-center justify-center gap-0 h-9 rounded-full px-2 shrink-0",
        "bg-background/80 backdrop-blur-sm border border-border shadow-sm",
        "text-muted-foreground hover:text-foreground transition-colors",
        // Pointer-events keep the surrounding sticky container scroll-friendly.
        "pointer-events-auto",
        // Focus-visible ring matches the rest of the UI primitives.
        "outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2",
        "disabled:opacity-50 disabled:pointer-events-none",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...rest}
    >
      <span className="flex items-center justify-center">{icon}</span>
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap text-xs font-medium",
          "transition-[max-width,padding] duration-200 ease-out",
          alwaysExpanded
            ? "max-w-[160px] pl-2"
            : // Collapsed by default; expand on group-hover (desktop) or
              // when the button itself becomes focus-visible (keyboard).
              "max-w-0 group-hover:max-w-[160px] group-hover:pl-2 group-focus-visible:max-w-[160px] group-focus-visible:pl-2",
        )}
      >
        {label}
      </span>
    </button>
  );
});
