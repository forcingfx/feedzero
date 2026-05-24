import { createElement, useMemo, type ReactNode } from "react";
import { markdownToHtml } from "@/core/extractor/markdown";
import { useArticleStore } from "@/stores/article-store";
import { useFeedStore } from "@/stores/feed-store";
import { CitationPreview } from "./citation-preview";
import type { Article, BriefingCitation, Feed } from "@feedzero/core/types";

/**
 * Renders the briefing abstract.
 *
 * Pipeline:
 *  1. Markdown → sanitized HTML via the existing marked + DOMPurify
 *     pipeline (`markdownToHtml`).
 *  2. Parse the HTML into a DOM tree.
 *  3. Walk it, mapping each DOM node to a React element. When we hit
 *     `[A<n>]` in a TEXT node, split the text and wrap the chip in a
 *     <CitationPreview> so it has the same HoverCard/Sheet behavior
 *     as Signal's StoryRow.
 *
 * Why this shape: previous version used `dangerouslySetInnerHTML` with
 * post-render event delegation on a parent `onClick`. That gave a flat
 * click → navigate, but no preview hover/tap. To wrap each chip with a
 * Radix HoverCard we need real React components at the chip sites,
 * which means rendering JSX instead of raw HTML.
 */
interface Props {
  /** Markdown abstract from the model. Contains [A1], [A2] citation tags. */
  abstract: string;
  /** Ordered citations array; [AN] in the abstract maps to citations[N-1]. */
  citations: BriefingCitation[];
}

const CITATION_RE = /\[A(\d+)\]/g;

export function BriefingAbstract({ abstract, citations }: Props) {
  const articles = useArticleStore((s) => s.articlesByFeedId);
  const feeds = useFeedStore((s) => s.feeds);

  // Index articles + feeds once per render so the recursive walk is
  // O(N) instead of O(N * citations.length).
  const articleById = useMemo(() => {
    const map = new Map<string, Article>();
    for (const list of Object.values(articles)) {
      for (const article of list) map.set(article.id, article);
    }
    return map;
  }, [articles]);

  const feedById = useMemo(() => {
    const map = new Map<string, Feed>();
    for (const f of feeds) map.set(f.id, f);
    return map;
  }, [feeds]);

  const tree = useMemo(() => {
    const html = markdownToHtml(abstract);
    const doc = new DOMParser().parseFromString(html, "text/html");
    return domToReact(
      doc.body.childNodes,
      citations,
      articleById,
      feedById,
      "root",
    );
  }, [abstract, citations, articleById, feedById]);

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none [&_a]:break-words">
      {tree}
    </div>
  );
}

function domToReact(
  nodes: NodeListOf<ChildNode>,
  citations: BriefingCitation[],
  articleById: Map<string, Article>,
  feedById: Map<string, Feed>,
  keyPrefix: string,
): ReactNode[] {
  const out: ReactNode[] = [];
  nodes.forEach((node, i) => {
    const key = `${keyPrefix}-${i}`;
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(...splitTextWithChips(node.textContent ?? "", citations, articleById, feedById, key));
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tagName = el.tagName.toLowerCase();
      const props = htmlAttrsToReactProps(el);
      const children = domToReact(el.childNodes, citations, articleById, feedById, key);
      // Void elements (e.g. <br>, <hr>) must not receive children.
      if (VOID_ELEMENTS.has(tagName)) {
        out.push(createReactElement(tagName, { ...props, key }));
      } else {
        out.push(createReactElement(tagName, { ...props, key }, children));
      }
    }
  });
  return out;
}

function splitTextWithChips(
  text: string,
  citations: BriefingCitation[],
  articleById: Map<string, Article>,
  feedById: Map<string, Feed>,
  keyPrefix: string,
): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let pieceCount = 0;
  for (const match of text.matchAll(CITATION_RE)) {
    const start = match.index ?? 0;
    if (start > lastIdx) {
      parts.push(text.slice(lastIdx, start));
    }
    const n = Number(match[1]);
    const citation = Number.isFinite(n) ? citations[n - 1] : undefined;
    if (!citation) {
      // Out-of-range index: render inert so an over-counting model
      // doesn't produce a dead-link chip.
      parts.push(match[0]);
    } else {
      const article = articleById.get(citation.articleId) ?? null;
      const feed = article ? feedById.get(article.feedId) : undefined;
      const chipKey = `${keyPrefix}-chip-${pieceCount++}`;
      parts.push(
        <CitationPreview key={chipKey} article={article} feed={feed}>
          <span className="mx-0.5 inline-flex items-baseline rounded bg-primary/10 px-1 py-0 align-baseline text-[0.75em] font-medium text-primary hover:bg-primary/20">
            A{n}
          </span>
        </CitationPreview>,
      );
    }
    lastIdx = (match.index ?? 0) + match[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

/** Map DOM element attributes to React-friendly props. */
function htmlAttrsToReactProps(el: Element): Record<string, string> {
  const props: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    const name = REACT_ATTR_MAP[attr.name] ?? attr.name;
    props[name] = attr.value;
  }
  return props;
}

const REACT_ATTR_MAP: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  // Anchor tags from marked already carry rel/target — keep as-is.
};

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function createReactElement(
  tagName: string,
  props: Record<string, unknown>,
  children?: ReactNode[],
): ReactNode {
  return children !== undefined
    ? createElement(tagName, props, ...children)
    : createElement(tagName, props);
}
