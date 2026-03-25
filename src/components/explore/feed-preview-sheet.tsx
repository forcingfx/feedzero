import { useState, useEffect } from "react";
import { Loader2, Plus, Minus, ExternalLink } from "lucide-react";
import { previewFeed } from "@/core/feeds/feed-service.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet.tsx";

interface PreviewArticle {
  title: string;
  link: string;
  summary: string;
  publishedAt: number | null;
}

interface FeedPreviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  feedUrl: string;
  siteUrl: string;
  description?: string;
  subscribed: boolean;
  onAdd: () => void;
  onRemove: () => void;
}

function formatDate(timestamp: number | null): string {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function FeedPreviewSheet({
  open,
  onOpenChange,
  name,
  feedUrl,
  siteUrl,
  description,
  subscribed,
  onAdd,
  onRemove,
}: FeedPreviewSheetProps) {
  const [articles, setArticles] = useState<PreviewArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (open && !fetched) {
      setLoading(true);
      setError(null);
      previewFeed(feedUrl).then((result) => {
        if (result.ok) {
          setArticles(result.value.articles);
        } else {
          setError(result.error);
        }
        setLoading(false);
        setFetched(true);
      });
    }
  }, [open, fetched, feedUrl]);

  // Reset when closing
  useEffect(() => {
    if (!open) {
      setFetched(false);
      setArticles([]);
      setError(null);
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-6">
        <SheetHeader className="sr-only">
          <SheetTitle>{name}</SheetTitle>
          <SheetDescription>Preview of {name}</SheetDescription>
        </SheetHeader>

        <div className="rounded-lg border bg-muted/30 p-4 mb-6 mt-6">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-lg border bg-background flex items-center justify-center shrink-0">
              <FeedFavicon siteUrl={siteUrl} className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-base">{name}</div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                {feedUrl}
              </div>
              {description && (
                <div className="text-sm text-muted-foreground mt-2">
                  {description}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-3 pt-3 border-t">
            {subscribed ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemove}
                className="text-muted-foreground hover:text-destructive"
              >
                <Minus className="size-3.5" />
                Remove
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={onAdd}>
                <Plus className="size-3.5" />
                Add feed
              </Button>
            )}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin mr-2" />
            Loading preview...
          </div>
        )}

        {error && (
          <div className="py-8 text-center text-muted-foreground text-sm">
            {error}
          </div>
        )}

        {!loading && !error && articles.length > 0 && (
          <div className="divide-y">
            {articles.map((article, i) => (
              <a
                key={article.link || i}
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block py-3 hover:bg-muted/50 -mx-2 px-2 rounded transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm">{article.title}</div>
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground mt-0.5" />
                </div>
                {article.publishedAt && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(article.publishedAt)}
                  </div>
                )}
                {article.summary && (
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {article.summary}
                  </div>
                )}
              </a>
            ))}
          </div>
        )}

        {!loading && !error && articles.length === 0 && fetched && (
          <div className="py-8 text-center text-muted-foreground text-sm">
            No articles found in this feed.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
