import { BookOpen, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { formatRelative } from "@/lib/format-relative.ts";
import { decodeEntities } from "@/lib/decode-entities.ts";
import type { Article } from "@/types/index.ts";

interface ArticlePreviewProps {
  article: Article;
  feedTitle: string;
  now: number;
  onOpen: () => void;
}

/**
 * Compact peek at an article — title, source, a plain-text teaser, and the
 * two ways to act on it. Shown in a HoverCard (desktop) or Sheet (mobile)
 * so the reader can triage from Signal without leaving the page.
 */
export function ArticlePreview({ article, feedTitle, now, onOpen }: ArticlePreviewProps) {
  const teaser = toPlainText(article.content || article.summary || "");
  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold leading-snug">{decodeEntities(article.title)}</h3>
        <p className="text-xs text-muted-foreground">
          {feedTitle}
          {" · "}
          {formatRelative(article.publishedAt, now)}
        </p>
      </div>
      {teaser ? (
        <p className="line-clamp-5 text-sm leading-relaxed text-muted-foreground">{teaser}</p>
      ) : (
        <p className="text-sm italic text-muted-foreground">No preview available.</p>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onOpen}>
          <BookOpen className="size-3.5" />
          Open in reader
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <a href={article.link} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-3.5" />
            Original
          </a>
        </Button>
      </div>
    </div>
  );
}

function toPlainText(html: string): string {
  const stripped = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return decodeEntities(stripped);
}
