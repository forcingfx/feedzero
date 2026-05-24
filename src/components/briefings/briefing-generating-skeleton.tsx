import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Long-running progress skeleton for a briefing in flight.
 *
 * Briefing generation can take 60–120s with Sonnet (longer with Opus,
 * faster with Haiku). A plain spinner with "Generating..." doesn't
 * carry the user through that — they wonder if the request died.
 * This component:
 *
 *  - cycles a status caption through realistic phases so the user sees
 *    forward motion even when network is quiet
 *  - shows the eventual briefing layout (headings + skeleton bullets)
 *    so they can anticipate the shape of the result
 *  - counts elapsed seconds so they have a tangible "yes, still alive"
 *    signal
 *  - explicitly notes "this can take a minute" so a 60s wait doesn't
 *    feel like a hang
 */

const STATUS_PHASES: ReadonlyArray<{ at: number; copy: string }> = [
  { at: 0, copy: "Sending your articles to Anthropic…" },
  { at: 5, copy: "Claude is reading the corpus…" },
  { at: 20, copy: "Looking for cross-feed patterns…" },
  { at: 40, copy: "Writing the briefing…" },
  { at: 70, copy: "Drafting takeaways and watch items…" },
  { at: 100, copy: "Almost there — finalizing citations…" },
];

interface Props {
  /** Wall-clock when the refresh started; used to compute elapsed time. */
  startedAt: number;
}

export function BriefingGeneratingSkeleton({ startedAt }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const phase =
    [...STATUS_PHASES].reverse().find((p) => elapsedSec >= p.at) ??
    STATUS_PHASES[0];

  return (
    <div className="space-y-6">
      <div
        role="status"
        aria-live="polite"
        className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
      >
        <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">{phase.copy}</p>
          <p className="text-xs text-muted-foreground">
            Briefings usually take 30–90 seconds. Your articles are being
            summarized by your own Claude key — feel free to switch tabs;
            we&apos;ll keep going.
          </p>
        </div>
        <span className="ml-auto shrink-0 self-start font-mono text-xs tabular-nums text-muted-foreground">
          {formatElapsed(elapsedSec)}
        </span>
      </div>

      <SkeletonSection heading="Key takeaways" bullets={4} />
      <SkeletonSection heading="What's happening" paragraphs={2} />
      <SkeletonSection heading="What to watch" bullets={2} />
    </div>
  );
}

function SkeletonSection({
  heading,
  bullets,
  paragraphs,
}: {
  heading: string;
  bullets?: number;
  paragraphs?: number;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {heading}
      </h2>
      <div className="space-y-2">
        {bullets !== undefined &&
          Array.from({ length: bullets }, (_, i) => (
            <SkeletonRow key={i} indent />
          ))}
        {paragraphs !== undefined &&
          Array.from({ length: paragraphs }, (_, i) => (
            <SkeletonParagraph key={i} />
          ))}
      </div>
    </section>
  );
}

function SkeletonRow({ indent }: { indent?: boolean }) {
  return (
    <div className={`flex items-start gap-2 ${indent ? "" : ""}`}>
      {indent && (
        <span
          aria-hidden
          className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/30"
        />
      )}
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-[92%] animate-pulse rounded bg-muted" />
        <div className="h-3 w-[70%] animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function SkeletonParagraph() {
  // Random-ish widths so the skeleton doesn't look like a stack of
  // identical bars. Computed once on mount; no need to re-roll on
  // every elapsed-second tick.
  const widths = ["96%", "88%", "92%", "75%"];
  return (
    <div className="space-y-1.5">
      {widths.map((w, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded bg-muted"
          style={{ width: w }}
        />
      ))}
    </div>
  );
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}
