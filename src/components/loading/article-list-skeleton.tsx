import { Skeleton } from "@/components/ui/skeleton.tsx";

/**
 * Placeholder rows for the article list's initial silent load. Mirrors
 * ArticleItem's shape (title line + meta line at row padding) so the
 * real rows land without a layout jump. Rendered only while the first
 * load is in flight — settled-empty states keep the refresh affordance.
 */
export function ArticleListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading articles" className="px-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="px-2 py-3 border-b border-border space-y-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      ))}
    </div>
  );
}
