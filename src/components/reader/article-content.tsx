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
      className="leading-relaxed max-w-180 animate-in fade-in duration-200 [&_a]:text-primary [&_a]:underline [&_a:hover]:text-primary/80 [&_p]:mb-4 [&_blockquote]:border-l-3 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:my-4 [&_img]:max-w-full [&_img]:h-auto [&_pre]:overflow-x-auto [&_pre]:bg-secondary [&_pre]:p-2 [&_pre]:rounded [&_figure]:my-4 [&_figcaption]:text-sm [&_figcaption]:text-muted-foreground [&_figcaption]:mt-2 [&_figcaption]:text-center"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
