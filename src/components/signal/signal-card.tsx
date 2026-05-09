import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { decodeEntities } from "@/lib/decode-entities.ts";
import { extractImage } from "@/lib/extract-image.ts";
import { formatRelative } from "@/lib/format-relative.ts";
import { cn } from "@/lib/utils.ts";
import type { ResolvedTopStory } from "@/stores/signal-store.ts";
import type { Article, Feed } from "@/types/index.ts";

export type SignalCardVariant = "hero" | "tile" | "brief";

interface SignalCardProps {
  story: ResolvedTopStory;
  feeds: Record<string, Feed>;
  variant: SignalCardVariant;
  onOpen: (story: ResolvedTopStory) => void;
}

/**
 * Three sizes for the top masonry:
 *   hero  — only one per page; full-bleed splash with image when available.
 *   tile  — image cards in the masonry.
 *   brief — text-only cards; pack tightly in the column flow.
 */
export function SignalCard({ story, feeds, variant, onOpen }: SignalCardProps) {
  const isHero = variant === "hero";
  const isBrief = variant === "brief";
  const image = isBrief ? null : pickImage(story.articles);
  const isSplash = isHero && !!image;

  if (isSplash) {
    return <SplashHero story={story} feeds={feeds} image={image!} onOpen={onOpen} />;
  }

  return (
    <article
      onClick={() => onOpen(story)}
      className={cn(
        "group cursor-pointer overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-accent/40 break-inside-avoid",
      )}
    >
      {image && (
        <div className="relative w-full overflow-hidden bg-muted aspect-[16/10]">
          <img
            src={image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}
      <div className={cn(isHero ? "p-5 md:p-6" : isBrief ? "p-3" : "p-3.5")}>
        <Heading variant={variant}>{decodeEntities(story.headline)}</Heading>
        <Blurb variant={variant}>{decodeEntities(story.blurb)}</Blurb>
        <SourceRow story={story} feeds={feeds} compact={isBrief} />
      </div>
    </article>
  );
}

function Heading({
  variant,
  children,
}: {
  variant: SignalCardVariant;
  children: React.ReactNode;
}) {
  const Tag = variant === "hero" ? "h2" : "h3";
  return (
    <Tag
      className={cn(
        "font-semibold leading-tight tracking-tight",
        variant === "hero" ? "text-2xl md:text-3xl" : variant === "brief" ? "text-sm" : "text-base",
      )}
    >
      {children}
    </Tag>
  );
}

function Blurb({
  variant,
  children,
}: {
  variant: SignalCardVariant;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "text-muted-foreground leading-snug mt-1.5",
        variant === "hero" ? "text-sm md:text-base" : "text-xs",
        variant === "brief" && "line-clamp-2",
      )}
    >
      {children}
    </p>
  );
}

function SourceRow({
  story,
  feeds,
  compact,
}: {
  story: ResolvedTopStory;
  feeds: Record<string, Feed>;
  compact: boolean;
}) {
  const uniqueFeedIds = Array.from(new Set(story.articles.map((a) => a.feedId)));
  const latest = Math.max(...story.articles.map((a) => a.publishedAt));
  return (
    <div
      data-testid="signal-card-sources"
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground",
        compact ? "mt-2" : "mt-3",
      )}
    >
      {uniqueFeedIds.map((feedId) => {
        const feed = feeds[feedId];
        if (!feed) return null;
        return (
          <span key={feedId} className="inline-flex items-center gap-1.5 min-w-0">
            <FeedFavicon siteUrl={feed.siteUrl || feed.url} className="size-3.5" />
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

/**
 * The hero card when there's an image: image fills the card edge-to-edge,
 * a dark gradient anchors the bottom, and the headline + blurb + sources sit
 * over the gradient in white.
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
  const uniqueFeedIds = Array.from(new Set(story.articles.map((a) => a.feedId)));
  const latest = Math.max(...story.articles.map((a) => a.publishedAt));
  return (
    <article
      onClick={() => onOpen(story)}
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-border bg-muted min-h-[24rem] break-inside-avoid"
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
        <div
          data-testid="signal-card-sources"
          className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-white/85"
        >
          {uniqueFeedIds.map((feedId) => {
            const feed = feeds[feedId];
            if (!feed) return null;
            return (
              <span key={feedId} className="inline-flex items-center gap-1.5 min-w-0">
                <FeedFavicon siteUrl={feed.siteUrl || feed.url} className="size-4" avatar />
                <span className="truncate max-w-[8rem]">{feed.title}</span>
              </span>
            );
          })}
          <span className="ml-auto" data-testid="signal-card-date">
            {formatRelative(latest)}
          </span>
        </div>
      </div>
    </article>
  );
}

function pickImage(articles: Article[]): string | null {
  for (const article of articles) {
    const url = extractImage(article);
    if (url) return url;
  }
  return null;
}
