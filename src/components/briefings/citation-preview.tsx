import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { ArticlePreview } from "@/components/signal/article-preview";
import { useIsDesktop } from "@/hooks/use-media-query";
import type { Article, Feed } from "@feedzero/core/types";

/**
 * Wraps `children` (a clickable trigger — the citation chip in the
 * abstract or a row in the citations list) with the same Signal-style
 * preview UX: HoverCard on desktop, bottom Sheet on mobile. Inside,
 * we reuse <ArticlePreview> so the briefing preview and the Signal
 * preview look identical — one component, one set of copy/layout
 * decisions.
 *
 * When the underlying article isn't in the local cache (deleted since
 * the briefing was generated, or never ingested), the wrapper renders
 * `children` plain — no preview, no broken state.
 */
interface Props {
  article: Article | null;
  feed: Feed | undefined;
  now?: number;
  children: ReactNode;
}

export function CitationPreview({ article, feed, now, children }: Props) {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!article) return <>{children}</>;

  const feedTitle = feed?.title ?? "Unknown feed";
  const openReader = () => {
    navigate(`/feeds/${article.feedId}/articles/${article.id}`, {
      state: { from: "/signal/briefings" },
    });
  };

  if (isDesktop) {
    return (
      <HoverCard openDelay={120} closeDelay={80}>
        <HoverCardTrigger asChild>
          <span
            role="button"
            tabIndex={0}
            onClick={openReader}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openReader();
              }
            }}
            className="cursor-pointer"
          >
            {children}
          </span>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="w-80">
          <ArticlePreview
            article={article}
            feedTitle={feedTitle}
            now={now ?? Date.now()}
            onOpen={openReader}
          />
        </HoverCardContent>
      </HoverCard>
    );
  }

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setSheetOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSheetOpen(true);
          }
        }}
        className="cursor-pointer"
      >
        {children}
      </span>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto p-4">
          <SheetTitle className="sr-only">Citation preview</SheetTitle>
          <SheetDescription className="sr-only">
            Peek at this cited article and open it in the reader.
          </SheetDescription>
          <ArticlePreview
            article={article}
            feedTitle={feedTitle}
            now={now ?? Date.now()}
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
