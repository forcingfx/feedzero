import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ChevronDown } from "lucide-react";
import { useIsDesktop } from "@/hooks/use-media-query.ts";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import { ArticlePreview } from "./article-preview.tsx";
import { formatRelative } from "@/lib/format-relative.ts";
import { decodeEntities } from "@/lib/decode-entities.ts";
import { cn } from "@/lib/utils.ts";
import type { Story } from "@/core/signal/types.ts";
import type { Article, Feed } from "@feedzero/core/types";

const ROW_CLASS =
  "flex w-full flex-col gap-1 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none";

const MULTI_BADGE_CLASS =
  "inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary";

interface StoryRowProps {
  story: Story;
  articleMap: Map<string, Article>;
  feedMap: Map<string, Feed>;
  now: number;
}

/**
 * One story within a topic. A single-outlet story is a plain row; a
 * multi-outlet story badges "Covered by N outlets" and expands to list each
 * outlet's version. Either way the row peeks on hover/tap and opens the
 * full item in the reader on click.
 */
export function StoryRow({ story, articleMap, feedMap, now }: StoryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const head = resolveHead(story, articleMap);
  if (!head) return null;

  const headFeed = feedMap.get(head.feedId)?.title ?? "Unknown feed";
  const multi = story.feedCount >= 2;

  return (
    <li className={cn(multi && "border-l-2 border-l-primary pl-3")}>
      <PreviewLink article={head} feedTitle={headFeed} now={now}>
        <span className="text-sm text-foreground">{decodeEntities(head.title)}</span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {multi ? (
            <span className={MULTI_BADGE_CLASS}>{`Covered by ${story.feedCount} outlets`}</span>
          ) : (
            <span>{headFeed}</span>
          )}
          <span>{formatRelative(head.publishedAt, now)}</span>
        </span>
      </PreviewLink>

      {multi ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="flex items-center gap-1 pb-2 text-xs font-medium text-primary hover:underline"
          >
            <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
            {expanded ? "Hide outlets" : `Show all ${story.feedCount} outlets`}
          </button>
          {expanded ? (
            <ul className="mb-2 ml-1 border-l border-border pl-3">
              {story.articleIds.map((id) => {
                const member = articleMap.get(id);
                if (!member) return null;
                const feedTitle = feedMap.get(member.feedId)?.title ?? "Unknown feed";
                return (
                  <li key={id}>
                    <PreviewLink article={member} feedTitle={feedTitle} now={now}>
                      <span className="text-sm text-foreground">{decodeEntities(member.title)}</span>
                      <span className="text-xs text-muted-foreground">
                        {feedTitle}
                        {" · "}
                        {formatRelative(member.publishedAt, now)}
                      </span>
                    </PreviewLink>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

function PreviewLink({
  article,
  feedTitle,
  now,
  children,
}: {
  article: Article;
  feedTitle: string;
  now: number;
  children: ReactNode;
}) {
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const openReader = () =>
    navigate(`/feeds/${article.feedId}/articles/${article.id}`, {
      state: { from: "/signal" },
    });

  if (isDesktop) {
    return (
      <HoverCard openDelay={120} closeDelay={80}>
        <HoverCardTrigger asChild>
          <button type="button" onClick={openReader} className={ROW_CLASS}>
            {children}
          </button>
        </HoverCardTrigger>
        <HoverCardContent align="start">
          <ArticlePreview article={article} feedTitle={feedTitle} now={now} onOpen={openReader} />
        </HoverCardContent>
      </HoverCard>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setSheetOpen(true)} className={ROW_CLASS}>
        {children}
      </button>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto p-4">
          <SheetTitle className="sr-only">Article preview</SheetTitle>
          <SheetDescription className="sr-only">
            Peek at this article and open it in the reader.
          </SheetDescription>
          <ArticlePreview
            article={article}
            feedTitle={feedTitle}
            now={now}
            onOpen={() => {
              setSheetOpen(false);
              openReader();
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

function resolveHead(story: Story, articleMap: Map<string, Article>): Article | undefined {
  for (const id of story.articleIds) {
    const article = articleMap.get(id);
    if (article) return article;
  }
  return undefined;
}
