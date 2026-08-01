import { Skeleton } from "@/components/ui/skeleton.tsx";

/**
 * Suspense fallback for lazy stage routes (Explore, Stats, Settings,
 * Signal, Briefing). Mirrors a generic stage layout — heading, then
 * content cards — so the route transition reads as "loading" instead
 * of the blank flash the empty <Suspense> used to produce.
 */
export function StageSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-4"
    >
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}
