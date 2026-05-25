import { useEffect, useState } from "react";
import { ExternalLink, Clock, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { useExtractionStore } from "@/stores/extraction-store.ts";
import { cn } from "@/lib/utils.ts";
import type { RateLimitedVerdict } from "@/stores/extraction-store.ts";

interface RateLimitedNoticeProps {
  verdict: RateLimitedVerdict;
  articleUrl: string;
  className?: string;
}

/**
 * Visible prompt for the case where /api/page returned 429 — typically
 * because a refresh-time prefetch burst exhausted the shared 300/60s
 * proxy rate-limit bucket. We surface the wait, count it down, and
 * enable "Try again" once the window has elapsed. Without this, the
 * "Full text" toggle would simply disable with a tooltip and the user
 * would think extraction is broken.
 */
export function RateLimitedNotice({
  verdict,
  articleUrl,
  className,
}: RateLimitedNoticeProps) {
  const fetchExtracted = useExtractionStore((s) => s.fetchExtracted);
  const [now, setNow] = useState(() => Date.now());

  // Tick once per second so the countdown stays current. Stops once the
  // window elapses to avoid an unbounded interval after the prompt is
  // ready.
  useEffect(() => {
    const expiresAt = verdict.observedAt + verdict.retryAfterSec * 1000;
    if (Date.now() >= expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [verdict.observedAt, verdict.retryAfterSec]);

  const remainingMs =
    verdict.observedAt + verdict.retryAfterSec * 1000 - now;
  const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const canRetry = remainingSec === 0;

  return (
    <div
      data-testid="rate-limited-notice"
      className={cn(
        "rounded-lg border border-border bg-muted/40 p-4 my-4 max-w-prose",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Clock className="size-5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium">
            Rate limited — extraction temporarily paused
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            The page proxy hit its rate limit. Background prefetch has
            been paused for the window. {canRetry ? (
              "You can try again now."
            ) : (
              <>Try again in <span className="font-mono">{remainingSec}s</span>.</>
            )}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button
              data-testid="rate-limited-retry"
              size="sm"
              disabled={!canRetry}
              onClick={() => fetchExtracted(articleUrl)}
              className="gap-1"
            >
              <RefreshCw className="size-3.5" />
              Try again
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="gap-1"
            >
              <a
                href={articleUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-3.5" />
                Open original
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
