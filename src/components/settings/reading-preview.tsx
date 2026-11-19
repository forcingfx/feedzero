import { ArticleContent } from "@/components/reader/article-content.tsx";
import {
  READER_TITLE_CLASS,
  readerColumnClass,
  type ReaderTypography,
} from "@/components/reader/reader-typography.ts";

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
 * Live sample of article text in Settings → Reading. It is styled by the
 * same class builder as the reader's column, so what it shows for a text
 * size, line spacing or width is what the reader will render. The column
 * is capped by this pane, so a width wider than the pane shows as full.
 */
export function ReadingPreview(typography: ReaderTypography) {
  return (
    <section
      aria-label="Preview"
      className="my-3 overflow-hidden rounded-lg border border-border bg-background"
    >
      <p className="border-b border-border px-4 py-1.5 text-xs text-muted-foreground">
        Preview
      </p>
      <div className="max-h-80 overflow-y-auto p-4 px-6">
        <div
          data-testid="reading-preview-column"
          className={readerColumnClass(typography)}
          onClick={keepSampleLinksInert}
        >
          <h3 className={READER_TITLE_CLASS}>{SAMPLE_TITLE}</h3>
          <ArticleContent html={SAMPLE_HTML} />
        </div>
      </div>
    </section>
  );
}
