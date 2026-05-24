import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { previewFeed } from "@/core/feeds/feed-service";
import type { FeedFormat } from "@/core/parser/parser";

/**
 * The discovery chip that lives under the Explore URL input.
 *
 * When the user pastes (or types) a URL, we silently probe it via
 * `previewFeed` after a brief debounce. The chip shows three format
 * pills — RSS, Atom, JSON Feed — and lights up the one feedsmith
 * actually identified. While probing, all three pills animate to
 * communicate "we're checking every format the publisher might be
 * serving".
 *
 * This is the affordance the landing-page copy ("Paste any URL.
 * FeedZero finds the feed.") had been claiming with nothing visible
 * to back it up.
 *
 * Tier note: bridges are off here — discovery against an arbitrary URL
 * is cheap, but the bridge cascade (YouTube/Reddit/Mastodon) is gated
 * to Personal and runs inside `addFeed` proper. The chip is a preview;
 * the headline action is still Enter → add.
 */
interface FeedFormatChipProps {
  url: string;
}

type ChipState =
  | { kind: "idle" }
  | { kind: "probing" }
  | { kind: "found"; format: FeedFormat; title: string }
  | { kind: "not-found" };

const DEBOUNCE_MS = 400;

const FORMAT_LABELS: { format: FeedFormat; label: string }[] = [
  { format: "rss", label: "RSS" },
  { format: "atom", label: "Atom" },
  { format: "json", label: "JSON Feed" },
];

export function FeedFormatChip({ url }: FeedFormatChipProps) {
  const [state, setState] = useState<ChipState>({ kind: "idle" });
  const generationRef = useRef(0);

  useEffect(() => {
    const trimmed = url.trim();
    if (!trimmed) {
      setState({ kind: "idle" });
      return;
    }
    const generation = ++generationRef.current;
    const timer = setTimeout(async () => {
      setState({ kind: "probing" });
      const result = await previewFeed(trimmed);
      if (generation !== generationRef.current) return; // stale probe
      if (result.ok) {
        setState({
          kind: "found",
          format: result.value.format,
          title: result.value.title,
        });
      } else {
        setState({ kind: "not-found" });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [url]);

  if (state.kind === "idle") return null;

  const probing = state.kind === "probing";
  const found = state.kind === "found";
  const notFound = state.kind === "not-found";

  return (
    <div
      data-testid="feed-format-chip"
      data-state={state.kind}
      data-format={found ? state.format : undefined}
      className="mt-2 flex items-center gap-2 text-xs"
    >
      {probing && (
        <Loader2 className="size-3 animate-spin text-muted-foreground" />
      )}
      {found && (
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-500" />
      )}
      <div className="flex items-center gap-1.5">
        {FORMAT_LABELS.map(({ format, label }) => {
          const active = found && state.format === format;
          return (
            <span
              key={format}
              data-testid={`format-pill-${format}`}
              data-active={active ? "true" : "false"}
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 font-medium transition-all duration-300",
                active &&
                  "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                !active &&
                  found &&
                  "border-border bg-transparent text-muted-foreground/60",
                probing &&
                  "border-border bg-transparent text-muted-foreground animate-pulse",
                notFound && "border-border bg-transparent text-muted-foreground/40",
              )}
            >
              {label}
            </span>
          );
        })}
      </div>
      <span className="ml-auto text-muted-foreground">
        {probing && "Checking every format…"}
        {found && (
          <>
            <span className="text-foreground">{state.title}</span>
            <span className="ml-1.5 text-muted-foreground">
              · Press Enter to add
            </span>
          </>
        )}
        {notFound && "No feed found at that URL yet"}
      </span>
    </div>
  );
}
