import { useMemo } from "react";
import DOMPurify from "dompurify";

interface ArticleContentProps {
  html: string;
}

/**
 * Renders pre-sanitized HTML content. DOMPurify is applied as a safety net
 * even though core modules already sanitize — defense in depth.
 */
export function ArticleContent({ html }: ArticleContentProps) {
  const clean = useMemo(
    () => DOMPurify.sanitize(html, { ADD_ATTR: ["target"] }),
    [html],
  );

  return (
    <div
      className="leading-relaxed max-w-180 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:mt-8 [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:tracking-tight [&_h3]:mt-6 [&_h3]:mb-2 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-4 [&_h4]:mb-2 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-primary/40 [&_a:hover]:decoration-primary [&_a]:transition-colors [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:mb-4 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:mb-1 [&_blockquote]:border-l-3 [&_blockquote]:border-primary/30 [&_blockquote]:bg-muted/20 [&_blockquote]:pl-4 [&_blockquote]:pr-3 [&_blockquote]:py-2 [&_blockquote]:my-4 [&_blockquote]:italic [&_blockquote]:rounded-r [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:shadow-sm [&_pre]:overflow-x-auto [&_pre]:bg-secondary [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:text-sm [&_pre]:shadow-inner [&_figure]:my-4 [&_figcaption]:text-sm [&_figcaption]:text-muted-foreground [&_figcaption]:mt-2 [&_figcaption]:text-center [&_hr]:border-none [&_hr]:h-px [&_hr]:bg-gradient-to-r [&_hr]:from-transparent [&_hr]:via-border [&_hr]:to-transparent [&_hr]:my-8"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
