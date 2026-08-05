import { toast } from "sonner";

/**
 * Share an article through the OS share sheet where available
 * (`navigator.share` — mobile browsers, some desktops), falling back to
 * copying the link with a confirming toast. A dismissed share sheet is
 * a non-event, not an error. Privacy-clean: user-initiated, the raw
 * article URL only, no tracking parameters added.
 */
export async function shareArticle(article: {
  title: string;
  link?: string;
}): Promise<void> {
  if (!article.link) return;

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: article.title, url: article.link });
    } catch {
      // AbortError when the user closes the sheet — nothing to do.
    }
    return;
  }

  await navigator.clipboard.writeText(article.link);
  toast("Link copied");
}
