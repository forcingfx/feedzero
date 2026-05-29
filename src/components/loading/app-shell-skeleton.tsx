import { useIsDesktop } from "@/hooks/use-media-query.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";

/**
 * Boot-time placeholder rendered while AppInit waits on the local DB.
 * Mirrors AppLayout's chrome (header + sidebar, or mobile shell) so
 * the first paint matches the final layout — no jarring snap from a
 * centered "Loading…" line into the real app.
 *
 * Intentionally minimal: any skeleton row that depends on user data
 * (feed titles, counts) would also race the data it's previewing.
 * The pulsing pills are placeholders for the sidebar's nav items only.
 */
export function AppShellSkeleton() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <MobileSkeleton />;
  return <DesktopSkeleton />;
}

function DesktopSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading FeedZero"
      className="flex h-svh overflow-hidden bg-background"
    >
      <aside className="flex w-[256px] shrink-0 flex-col gap-3 border-r bg-sidebar p-3">
        <Skeleton className="h-7 w-32" />
        <div className="mt-2 space-y-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      </aside>
      <div className="flex-1" />
    </div>
  );
}

function MobileSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading FeedZero"
      className="flex h-dvh flex-col overflow-hidden bg-background"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Skeleton className="h-5 w-24" />
      </header>
      <div className="flex-1" />
      <div className="h-[calc(60px+env(safe-area-inset-bottom))] shrink-0 border-t bg-background" />
    </div>
  );
}
