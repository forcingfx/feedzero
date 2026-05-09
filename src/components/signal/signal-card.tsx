import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { decodeEntities } from "@/lib/decode-entities.ts";
import { extractImage } from "@/lib/extract-image.ts";
import { formatRelative } from "@/lib/format-relative.ts";
import { cn } from "@/lib/utils.ts";
import type { ResolvedTopStory } from "@/stores/signal-store.ts";
import type { Article, Feed } from "@/types/index.ts";

export type SignalCardVariant = "hero" | "list-item";

interface SignalCardProps {
  story: ResolvedTopStory;
  feeds: Record<string, Feed>;
  variant: SignalCardVariant;
  /** 1-based position in the top-N list. */
  rank: number;
  onOpen: (story: ResolvedTopStory) => void;
}

/**
 * Two layouts share one component:
 *   hero      — only #1; full-bleed splash with image when available.
 *   list-item — #2 through #10; rank number, headline, blurb, sources on one row.
 */
export function SignalCard({ story, feeds, variant, rank, onOpen }: SignalCardProps) {
  if (variant === "hero") {
    return <HeroCard story={story} feeds={feeds} onOpen={onOpen} />;
  }
  return <ListItemCard story={story} feeds={feeds} rank={rank} onOpen={onOpen} />;
}

function HeroCard({
  story,
  feeds,
  onOpen,
}: {
  story: ResolvedTopStory;
  feeds: Record<string, Feed>;
  onOpen: (story: ResolvedTopStory) => void;
}) {
  const image = pickImage(story.articles);
  if (image) return <SplashHero story={story} feeds={feeds} image={image} onOpen={onOpen} />;

  return (
    <article
      onClick={() => onOpen(story)}
      className="group cursor-pointer overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-accent/40"
    >
      <div className="p-5 md:p-6">
        <h2 className="text-2xl md:text-3xl font-semibold leading-tight tracking-tight">
          {decodeEntities(story.headline)}
        </h2>
        <p className="text-muted-foreground leading-snug mt-1.5 text-sm md:text-base">
          {decodeEntities(story.blurb)}
        </p>
        <SourceRow story={story} feeds={feeds} className="mt-3" />
      </div>
    </article>
  );
}

/**
 * Hero with image: image fills the card edge-to-edge, dark gradient anchors
 * the bottom, headline + blurb + sources sit over the gradient in white.
 */
function SplashHero({
  story,
  feeds,
  image,
  onOpen,
}: {
  story: ResolvedTopStory;
  feeds: Record<string, Feed>;
  image: string;
  onOpen: (story: ResolvedTopStory) => void;
}) {
  return (
    <article
      onClick={() => onOpen(story)}
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-border bg-muted min-h-[24rem]"
    >
      <img
        src={image}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
      <div className="relative flex h-full flex-col justify-end p-5 md:p-6 text-white">
        <h2 className="text-2xl md:text-3xl font-semibold leading-tight tracking-tight text-white">
          {decodeEntities(story.headline)}
        </h2>
        <p className="mt-1.5 text-sm md:text-base leading-snug text-white/85">
          {decodeEntities(story.blurb)}
        </p>
        <SourceRow story={story} feeds={feeds} className="mt-4" tone="onImage" />
      </div>
    </article>
  );
}

function ListItemCard({
  story,
  feeds,
  rank,
  onOpen,
}: {
  story: ResolvedTopStory;
  feeds: Record<string, Feed>;
  rank: number;
  onOpen: (story: ResolvedTopStory) => void;
}) {
  return (
    <article
      onClick={() => onOpen(story)}
      className="group flex cursor-pointer gap-4 border-t border-border/70 py-4 transition-colors hover:bg-accent/30"
    >
      <div
        aria-hidden="true"
        className="shrink-0 w-8 text-2xl font-semibold tabular-nums tracking-tight text-muted-foreground/70 leading-none pt-0.5"
      >
        {rank}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-base md:text-lg font-semibold leading-snug tracking-tight">
          {decodeEntities(story.headline)}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground leading-snug">
          {decodeEntities(story.blurb)}
        </p>
        <SourceRow story={story} feeds={feeds} className="mt-2" />
      </div>
    </article>
  );
}

function SourceRow({
  story,
  feeds,
  className,
  tone = "default",
}: {
  story: ResolvedTopStory;
  feeds: Record<string, Feed>;
  className?: string;
  tone?: "default" | "onImage";
}) {
  const uniqueFeedIds = Array.from(new Set(story.articles.map((a) => a.feedId)));
  const latest = Math.max(...story.articles.map((a) => a.publishedAt));
  return (
    <div
      data-testid="signal-card-sources"
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs",
        tone === "onImage" ? "text-white/85" : "text-muted-foreground",
        className,
      )}
    >
      {uniqueFeedIds.map((feedId) => {
        const feed = feeds[feedId];
        if (!feed) return null;
        return (
          <span key={feedId} className="inline-flex items-center gap-1.5 min-w-0">
            <FeedFavicon
              siteUrl={feed.siteUrl || feed.url}
              className={cn("size-3.5", tone === "onImage" && "size-4")}
              avatar={tone === "onImage"}
            />
            <span className="truncate max-w-[8rem]">{feed.title}</span>
          </span>
        );
      })}
      <span className="ml-auto" data-testid="signal-card-date">
        {formatRelative(latest)}
      </span>
    </div>
  );
}

function pickImage(articles: Article[]): string | null {
  for (const article of articles) {
    const url = extractImage(article);
    if (url) return url;
  }
  return null;
}
