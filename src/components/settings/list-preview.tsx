import { ArticleItem } from "@/components/articles/article-item.tsx";
import { LIST_TEXT_SIZE_CLASS } from "@/components/articles/list-text-size.ts";
import { cn } from "@/lib/utils.ts";
import type { Article, ListTextSize } from "@feedzero/core/types";

/** A fixed moment, so the sample's "2h ago" never drifts. */
const SAMPLE_PUBLISHED_AT = () => Date.now() - 2 * 60 * 60 * 1000;

function sampleArticle(): Article {
  return {
    id: "list-preview-sample",
    feedId: "list-preview-sample-feed",
    guid: "list-preview-sample",
    title: "A lighthouse keeper's last winter",
    link: "",
    content: "",
    summary:
      "The lamp at Skerry Point has turned every night since 1871. This spring the light goes automatic, and the keeper goes back to the mainland.",
    author: "Mara Ellison",
    publishedAt: SAMPLE_PUBLISHED_AT(),
    read: false,
    createdAt: 0,
  };
}

/**
 * Live sample of an article row in Settings → List. It is the real row
 * component inside the list's own size class, so what it shows for a
 * size, the preview lines or the feed icon is what the list will render.
 * Article images are left out: a sample has no image to fetch, and the
 * setting exists because fetching one is a request.
 */
export function ListPreview({
  size,
  showPreview,
  showFeedIcon,
}: {
  size: ListTextSize;
  showPreview: boolean;
  showFeedIcon: boolean;
}) {
  return (
    <section
      aria-label="Preview"
      className="my-3 overflow-hidden rounded-lg border border-border bg-background"
    >
      <p className="border-b border-border px-4 py-1.5 text-xs text-muted-foreground">Preview</p>
      {/* inert: the sample row is for looking at, not for opening. */}
      <ul
        role="listbox"
        aria-label="Sample article row"
        inert
        className={cn("m-0 list-none p-0 [&>li]:border-b-0", LIST_TEXT_SIZE_CLASS[size])}
      >
        <ArticleItem
          article={sampleArticle()}
          isSelected={false}
          highlightSelected={false}
          onSelect={() => {}}
          feedTitle="The Coastal Dispatch"
          // Not a URL on purpose: FeedFavicon shows its placeholder icon
          // and nothing is requested.
          feedSiteUrl={showFeedIcon ? "sample" : undefined}
          showPreview={showPreview}
        />
      </ul>
    </section>
  );
}
