import { cn } from "@/lib/utils.ts";

interface BrandMarkProps {
  /** Additional Tailwind classes; usually a `size-*` utility. */
  className?: string;
  /**
   * Override the alt text. Defaults to "FeedZero" — set to empty string
   * (alt="") when the mark sits next to the visible wordmark so screen
   * readers don't announce it twice.
   */
  alt?: string;
}

/**
 * The FeedZero brand mark. Source is the 192x192 RGBA PNG in /public; the
 * area outside the circle is transparent, so the icon composites cleanly
 * over any background without a rounded clip.
 */
export function BrandMark({ className, alt = "FeedZero" }: BrandMarkProps) {
  return (
    <img
      src="/icon-192.png"
      alt={alt}
      className={cn("shrink-0 select-none", className)}
      draggable={false}
    />
  );
}
