import { ArticleContent } from "@/components/reader/article-content.tsx";
import {
  READER_TITLE_CLASS,
  READER_WIDTH_PX,
  readerTextClass,
  type ReaderTypography,
} from "@/components/reader/reader-typography.ts";
import type { ReaderWidth } from "@feedzero/core/types";
import { cn } from "@/lib/utils.ts";

/**
 * Column width in the preview, as a share of the pane. The reader's real
 * measures (600 / 720 / 960px / none) cannot be used here: the settings
 * pane is about 700px wide, so three of the four overflowed it and looked
 * the same. The shares are the measures against a 1200px reader, so the
 * steps between options keep their true proportions. Desktop only: on a
 * narrower screen the article fills the width whatever is chosen, and the
 * preview shows exactly that.
 */
const PREVIEW_WIDTH_SCALE: Record<ReaderWidth, string> = {
  narrow: "lg:max-w-[50%]",
  medium: "lg:max-w-[60%]",
  wide: "lg:max-w-[80%]",
  full: "lg:max-w-none",
};

function describeWidth(width: ReaderWidth): string {
  const px = READER_WIDTH_PX[width];
  const measure = px === null ? "as wide as the reader" : `up to ${px}px wide`;
  return `Column ${measure}, shown to scale`;
}

/**
 * Sample article. It goes through ArticleContent like a real one, so the
 * link, quote and paragraph spacing are the reader's own. The link points
 * nowhere: a preview must not navigate away from settings.
 */
const SAMPLE_TITLE = "A lighthouse keeper's last winter";
const SAMPLE_HTML = `
<p>The lamp at Skerry Point has turned every night since 1871, and for the
past thirty of those years it has been wound by the same pair of hands.
This spring the light goes automatic, and the keeper goes
<a href="#">back to the mainland</a>.</p>
<blockquote>You stop hearing the sea after a while. Then one calm night it
is gone, and the quiet wakes you.</blockquote>
<p>He has kept a log of every ship that passed, and means to leave it on
the shelf for whoever climbs the stairs next.</p>
`;

function keepSampleLinksInert(event: React.MouseEvent) {
  if ((event.target as Element).closest("a")) event.preventDefault();
}

/**
 * Live sample of article text in Settings → Reading. Text size and line
 * spacing come from the reader's own class builder and are shown at real
 * size. Reading width is drawn to scale (see PREVIEW_WIDTH_SCALE), with
 * the real measure stated beside the label.
 */
export function ReadingPreview({ textSize, width, lineHeight }: ReaderTypography) {
  return (
    <section
      aria-label="Preview"
      className="my-3 overflow-hidden rounded-lg border border-border bg-background"
    >
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border px-4 py-1.5 text-xs text-muted-foreground">
        <span>Preview</span>
        <span data-testid="reading-preview-width" className="max-lg:hidden">
          {describeWidth(width)}
        </span>
        <span data-testid="reading-preview-narrow-note" className="lg:hidden">
          An article fills this screen at every reading width.
        </span>
      </p>
      <div className="max-h-80 overflow-y-auto p-4 px-6">
        <div
          data-testid="reading-preview-column"
          className={cn(
            "mx-auto transition-[max-width] duration-200 motion-reduce:transition-none",
            PREVIEW_WIDTH_SCALE[width],
            readerTextClass({ textSize, lineHeight }),
          )}
          onClick={keepSampleLinksInert}
        >
          <h3 className={READER_TITLE_CLASS}>{SAMPLE_TITLE}</h3>
          <ArticleContent html={SAMPLE_HTML} />
        </div>
      </div>
    </section>
  );
}
