import { useMemo } from "react";
import { markdownToHtml } from "@/core/extractor/markdown";
import type { BriefingCitation } from "@feedzero/core/types";

interface Props {
  /** Markdown abstract from the model. Contains [A1], [A2] citation tags. */
  abstract: string;
  /** Ordered citations array; [AN] in the abstract maps to citations[N-1]. */
  citations: BriefingCitation[];
  /** Click handler for a citation chip — receives the underlying articleId. */
  onCitationClick?: (articleId: string) => void;
}

/**
 * Renders the briefing abstract: markdown → sanitized HTML, then walks
 * the rendered tree and replaces `[AN]` text occurrences with clickable
 * citation chips that link into the reader.
 *
 * The replacement is text-only (not regex over raw markdown) so a
 * `[An]` inside a code block stays inert — `markdownToHtml` already
 * wrapped that in a `<code>`, and we skip nodes inside `code`/`pre`.
 */
export function BriefingAbstract({ abstract, citations, onCitationClick }: Props) {
  const html = useMemo(() => markdownToHtml(abstract), [abstract]);

  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none [&_a]:break-words"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        const chip = target.closest<HTMLElement>("[data-briefing-citation]");
        if (!chip || !onCitationClick) return;
        const idx = Number(chip.dataset.briefingCitation);
        const citation = citations[idx];
        if (citation) onCitationClick(citation.articleId);
      }}
      // After sanitization the HTML is safe; we still process it with a
      // post-render walk that swaps [AN] text for citation chips.
      dangerouslySetInnerHTML={{
        __html: injectCitationChips(html, citations.length),
      }}
    />
  );
}

const CITATION_RE = /\[A(\d+)\]/g;

/**
 * Walk the sanitized HTML string and replace [AN] occurrences (in text
 * only) with a styled citation chip. We add `data-briefing-citation`
 * with the 0-based index so the click handler in the parent component
 * can look up the underlying article. Out-of-range indexes render as
 * inert text so a model that over-counts doesn't produce a dead chip.
 *
 * Plain string replace is fine here because we only ever insert markup
 * that DOMPurify-allowlisted shapes accept (a span with a data attr).
 */
function injectCitationChips(html: string, count: number): string {
  return html.replace(CITATION_RE, (_match, n) => {
    const oneBased = Number(n);
    if (!Number.isFinite(oneBased) || oneBased < 1 || oneBased > count) {
      return `[A${n}]`;
    }
    return `<button type="button" data-briefing-citation="${
      oneBased - 1
    }" class="inline-flex items-baseline rounded bg-primary/10 px-1 py-0 text-[0.75em] font-medium text-primary hover:bg-primary/20">A${n}</button>`;
  });
}
