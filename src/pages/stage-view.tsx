import type { ReactNode } from "react";
import { useIsDesktop } from "@/hooks/use-media-query.ts";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";

/**
 * Wraps a stage route (explore, stats, settings) in the right scroll
 * affordance for the current viewport:
 *
 *  - Desktop: <ScrollArea> so the stage panel scrolls within the
 *    constant outer ResizablePanelGroup (ADR 013).
 *  - Mobile: <main> with overflow-y-auto so the content sits between
 *    the header and the persistent bottom drawer.
 *
 * The feeds route does its own scroll handling (snap container on
 * mobile, inner ResizablePanelGroup on desktop) and does NOT use this
 * wrapper.
 */
export function StageView({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();
  if (isDesktop) {
    return <ScrollArea className="h-full">{children}</ScrollArea>;
  }
  return (
    <main role="main" className="flex-1 overflow-y-auto">
      {children}
    </main>
  );
}
