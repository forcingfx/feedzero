import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Rss, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { previewWithDiscovery } from "@/core/feeds/feed-service";
import type { FeedFormat } from "@/core/parser/parser";

/**
 * Discovery chip under the Explore URL input.
 *
 * Lifecycle:
 *   user types/pastes  →  400ms debounce  →  previewFeed() probe  →
 *     · `found <fmt>`  — matched pill highlights; feed title appears;
 *                        a clickable "Add feed" button (= Enter) shows
 *     · `probing`      — spinner + "Checking…" while the probe runs
 *     · `not-found`    — gentle "We couldn't find a feed there" copy
 *
 * The chip is the affordance the landing copy ("Paste any URL.
 * FeedZero finds the feed.") implied; the Add button on success makes
 * the headline action discoverable without keyboard knowledge.
 *
 * The `onAdd` callback is optional — when omitted the chip is a pure
 * status indicator (the form still submits on Enter via its parent).
 * When provided, clicking the button runs the same code path.
 */
interface FeedFormatChipProps {
  url: string;
  onAdd?: () => void;
  /** Disable the Add button while an outer add-feed call is in flight. */
  isAdding?: boolean;
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

/** Format name for the celebratory headline ("Atom feed found"). */
function formatHeadline(format: FeedFormat): string {
  if (format === "rss") return "RSS";
  if (format === "atom") return "Atom";
  return "JSON";
}

export function FeedFormatChip({ url, onAdd, isAdding }: FeedFormatChipProps) {
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
      // previewWithDiscovery runs the full addFeed cascade — direct
      // parse first, then HTML autodiscovery + well-known paths — so
      // the chip's verdict matches what Enter would actually do.
      // Without this the chip would say "no feed found" for
      // https://www.nytimes.com even though pressing Enter happily
      // resolves nytimes.com → its HomePage.xml.
      const result = await previewWithDiscovery(trimmed);
      if (generation !== generationRef.current) return; // stale probe
      if (result.ok) {
        setState({
          kind: "found",
          format: result.value.format,
          title: result.value.title || trimmed,
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
      className="mt-2 flex items-center gap-3 text-xs"
    >
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
                  "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shadow-[0_0_0_3px_var(--tw-shadow-color)] shadow-emerald-500/10",
                !active &&
                  found &&
                  "border-border bg-transparent text-muted-foreground/50",
                probing &&
                  "border-border bg-transparent text-muted-foreground/70 animate-pulse",
                notFound && "border-border bg-transparent text-muted-foreground/40",
              )}
            >
              {label}
            </span>
          );
        })}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {probing && (
          <>
            <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
            <span className="truncate text-muted-foreground">
              Looking for a feed…
            </span>
          </>
        )}
        {found && (
          <>
            <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-500" />
            <span className="truncate">
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                {formatHeadline(state.format)} feed found
              </span>
              <span className="mx-1.5 text-muted-foreground">·</span>
              <span className="text-foreground">{state.title}</span>
            </span>
          </>
        )}
        {notFound && (
          <>
            <X className="size-3.5 shrink-0 text-muted-foreground/60" />
            <span className="truncate text-muted-foreground">
              We couldn&apos;t find a feed there. Try the homepage URL — we&apos;ll
              autodiscover.
            </span>
          </>
        )}
      </div>

      {found && onAdd && (
        <button
          type="button"
          onClick={onAdd}
          disabled={isAdding}
          data-testid="feed-format-chip-add"
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            "bg-foreground text-background shadow-sm transition-all",
            "hover:brightness-110 active:scale-[0.98]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
          aria-label={`Add feed: ${state.title}`}
        >
          {isAdding ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Rss className="size-3" />
          )}
          <span>Add feed</span>
          <Kbd className="ml-0.5 bg-background/15 text-background/90 border-background/20">
            Enter
          </Kbd>
        </button>
      )}

      {notFound && onAdd && (
        // The probe couldn't find a feed, but addFeed runs its own
        // discovery cascade — sometimes it finds one when we don't
        // (server-side cookies, bridges, JS-redirected homepages).
        // Keep the affordance visible so the user always has a path
        // forward instead of staring at a dead-end "no feed found".
        <button
          type="button"
          onClick={onAdd}
          disabled={isAdding}
          data-testid="feed-format-chip-add"
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
            "border-border bg-background text-foreground shadow-sm transition-all",
            "hover:bg-muted active:scale-[0.98]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
          aria-label="Try anyway: run full discovery and add this URL"
        >
          {isAdding ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Rss className="size-3 text-muted-foreground" />
          )}
          <span>Try anyway</span>
          <Kbd className="ml-0.5">Enter</Kbd>
        </button>
      )}
    </div>
  );
}
