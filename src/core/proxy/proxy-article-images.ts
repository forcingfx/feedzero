/**
 * Route article-body images through FeedZero's image proxy.
 *
 * A browser that loads an <img> straight from a publisher's host hands
 * that host the reader's IP address. Rewriting every remote image to the
 * same-origin /api/icon route means the publisher sees the server's
 * address instead. Runs at render time (ArticleContent), so content
 * already stored encrypted in IndexedDB needs no migration and every
 * render path (feed content, extracted full text, desktop, mobile) gets
 * the same treatment. See ADR 034.
 */

/**
 * Query value of `mode` that marks an article-body image request. Lives
 * here, not in icon-route.ts, so the client bundle never imports the
 * server handlers to learn it.
 */
export const ARTICLE_IMAGE_MODE = "article";

/** Which cap the proxy applies: favicons and list thumbnails keep the small one. */
export type ProxiedImagePurpose = "icon" | "article";

/** Build the same-origin proxy URL for a remote image. */
export function proxiedImageUrl(
  imageUrl: string,
  purpose: ProxiedImagePurpose,
): string {
  const base = `/api/icon?url=${encodeURIComponent(imageUrl)}`;
  return purpose === "article" ? `${base}&mode=${ARTICLE_IMAGE_MODE}` : base;
}

/**
 * Rewrite every remote `<img src>` in `html` to the proxy, resolving
 * relative URLs against `articleUrl` first. `srcset`, `sizes` and
 * `<picture><source>` are removed rather than rewritten: each candidate
 * would be a further direct load, and the proxied `src` is enough to show
 * the image. `data:` URIs load nothing remotely and are left alone.
 */
export function proxyArticleImages(html: string, articleUrl?: string): string {
  if (!html || !/<(img|source)\b/i.test(html)) return html;

  const doc = new DOMParser().parseFromString(
    `<div id="root">${html}</div>`,
    "text/html",
  );
  const root = doc.getElementById("root");
  if (!root) return html;

  for (const source of root.querySelectorAll("picture > source")) {
    source.remove();
  }
  for (const img of root.querySelectorAll("img")) {
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    const remote = remoteImageUrl(img.getAttribute("src"), articleUrl);
    if (remote) img.setAttribute("src", proxiedImageUrl(remote, "article"));
  }
  return root.innerHTML;
}

/** The absolute http(s) URL an image `src` would load, or null if none. */
function remoteImageUrl(
  src: string | null,
  articleUrl: string | undefined,
): string | null {
  if (!src) return null;
  try {
    const url = articleUrl ? new URL(src, articleUrl) : new URL(src);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    // Relative with no article URL: it resolves against FeedZero's own
    // origin, which reveals nothing to any publisher.
    return null;
  }
}
