import DOMPurify from "dompurify";

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "hr",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "dl",
    "dt",
    "dd",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "s",
    "del",
    "ins",
    "mark",
    "a",
    "img",
    "figure",
    "figcaption",
    "blockquote",
    "pre",
    "code",
    "kbd",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "span",
    "div",
    "article",
    "section",
    "sup",
    "sub",
    "abbr",
    "time",
  ],
  ALLOWED_ATTR: [
    "href",
    "src",
    "alt",
    "title",
    "datetime",
    "colspan",
    "rowspan",
    "class",
  ],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ["target", "rel"],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

// Force all links to open in new tab safely
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/**
 * Sanitize an HTML string, returning safe HTML.
 * Uses DOMPurify for production-grade XSS protection.
 */
export function sanitize(html: string): string {
  if (!html || typeof html !== "string") return "";
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}
