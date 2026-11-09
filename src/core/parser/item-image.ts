/**
 * Lead image for an article row (issue #340).
 *
 * Sources, in order of how deliberately the publisher chose them:
 * media:thumbnail, an image-typed media:content, an image enclosure, then
 * the first <img> in the body. Only absolute http(s) URLs qualify: a
 * relative path has no base we trust, and data:/javascript: never reach
 * the proxy.
 */

interface MediaLike {
  url?: string;
  type?: string;
  medium?: string;
}

/** The subset of a feedsmith item this picker reads. Every field optional. */
export interface ItemImageSource {
  media?: { thumbnails?: MediaLike[]; contents?: MediaLike[] };
  enclosures?: MediaLike[];
}

const IMG_SRC = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i;

export function pickItemImage(
  item: ItemImageSource,
  contentHtml?: string,
): string | undefined {
  const candidates = [
    item.media?.thumbnails?.[0]?.url,
    item.media?.contents?.find(isImage)?.url,
    item.enclosures?.find(isImage)?.url,
    contentHtml ? IMG_SRC.exec(contentHtml)?.[1] : undefined,
  ];
  return candidates.find(isAbsoluteHttp);
}

function isImage(m: MediaLike): boolean {
  return (m.type?.startsWith("image/") ?? false) || m.medium === "image";
}

function isAbsoluteHttp(url: string | undefined): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim());
}
