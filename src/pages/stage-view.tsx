import type { ReactNode } from "react";
import { useIsDesktop } from "@/hooks/use-media-query.ts";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { CLEAR_MOBILE_CHROME } from "@/components/layout/mobile-chrome.ts";
import { cn } from "@/lib/utils";

/**
 * Wraps a stage route (explore, stats, settings) in the right scroll
 * affordance for the current viewport:
 *
 *  - Desktop: <ScrollArea> so the stage panel scrolls within the
 *    constant outer ResizablePanelGroup (ADR 013).
 *  - Mobile: <main> with overflow-y-auto that runs underneath the glass
 *    header and tab bar, padded so its content rests clear of them.
 *
 * The feeds route does its own scroll handling (snap container on
 * mobile, inner ResizablePanelGroup on desktop) and does NOT use this
 * wrapper.
 */
export function StageView({
  children,
  selfScrolling = false,
}: {
  children: ReactNode;
  /**
   * The page scrolls inside its own box (Signal: tabs pinned over its own
   * scroller). On mobile <main> then only clears the glass header and does
   * not scroll, so there is one scroller; the page pads its own scroller by
   * --chrome-bottom.
   */
  selfScrolling?: boolean;
}) {
  const isDesktop = useIsDesktop();
  if (isDesktop) {
    return <ScrollArea className="h-full">{children}</ScrollArea>;
  }
  return (
    <main
      role="main"
      className={
        selfScrolling
          ? "flex flex-1 min-h-0 flex-col overflow-hidden pt-[var(--chrome-top,0px)]"
          : cn("flex-1 overflow-y-auto", CLEAR_MOBILE_CHROME)
      }
    >
      {children}
    </main>
  );
}
