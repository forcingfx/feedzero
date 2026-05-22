import { BookOpen, ExternalLink, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { useExtractionStore } from "@/stores/extraction-store.ts";
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
 *
 * Feed bodies are stripped from the sync vault (see `sync-service.ts`), so a
 * synced article often has no `content`/`summary`. When that happens we fall
 * back to any already-extracted text, and otherwise offer a one-tap load.
 * Fetching is never automatic (a hover must not hit the network) — the user
 * opts in by pressing the button, matching the privacy contract.
 */
export function ArticlePreview({ article, feedTitle, now, onOpen }: ArticlePreviewProps) {
  const extractedCache = useExtractionStore((s) => s.cache[article.link]);
  const status = useExtractionStore((s) => s.getStatus(article.link));
  const extractInBackground = useExtractionStore((s) => s.extractInBackground);

  const feedBody = article.content || article.summary || article.extractedContent || "";
  const teaser = toPlainText(feedBody || extractedCache || "");
  const loading = status === "extracting";
  const failed = status === "failed";

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
      ) : loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Loading preview…
        </p>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">
            {failed
              ? "Couldn't load a preview. Open the article to read it."
              : "This feed didn't include a preview."}
          </p>
          {!failed ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => extractInBackground(article.link)}
            >
              <FileText className="size-3.5" />
              Load preview
            </Button>
          ) : null}
        </div>
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
