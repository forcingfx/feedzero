import { RefreshCw } from "lucide-react";

interface PullToRefreshIndicatorProps {
  /** Current pull distance from usePullToRefresh. */
  pullPx: number;
  /** True while the refresh promise is in flight. */
  isRefreshing: boolean;
}

/**
 * Visual feedback for the pull-to-refresh gesture: a growing strip with
 * an arrow that rotates with pull distance, spinning once released.
 * Shared by the Signal page and the article list so the gesture reads
 * identically everywhere.
 */
export function PullToRefreshIndicator({
  pullPx,
  isRefreshing,
}: PullToRefreshIndicatorProps) {
  if (pullPx <= 0) return null;
  const height = Math.min(pullPx, 80);
  return (
    <div
      data-testid="pull-to-refresh-indicator"
      className="flex items-center justify-center text-xs text-muted-foreground transition-[height]"
      style={{ height }}
    >
      <RefreshCw
        className={`size-4 ${isRefreshing ? "animate-spin" : ""}`}
        style={{ transform: `rotate(${height * 4.5}deg)` }}
      />
    </div>
  );
}
