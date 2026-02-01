import DOMPurify from "dompurify";

interface ArticleContentProps {
  html: string;
}

/**
 * Renders pre-sanitized HTML content. DOMPurify is applied as a safety net
 * even though core modules already sanitize — defense in depth.
 */
export function ArticleContent({ html }: ArticleContentProps) {
  const clean = DOMPurify.sanitize(html, {
    ADD_ATTR: ["target"],
  });

  return (
    <div
      className="prose prose-neutral max-w-180"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
