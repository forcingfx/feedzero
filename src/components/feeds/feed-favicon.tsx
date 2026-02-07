import { useState } from "react";
import { Rss } from "lucide-react";

interface FeedFaviconProps {
  siteUrl: string;
  className?: string;
}

/** Displays a feed's favicon with a fallback globe icon. */
export function FeedFavicon({
  siteUrl,
  className = "size-4",
}: FeedFaviconProps) {
  const [failed, setFailed] = useState(false);

  if (!siteUrl || failed) {
    return <Rss className={`${className} text-muted-foreground shrink-0`} />;
  }

  let faviconUrl: string;
  try {
    const url = new URL(siteUrl);
    const directUrl = `${url.origin}/favicon.ico`;
    faviconUrl = `/api/icon?url=${encodeURIComponent(directUrl)}`;
  } catch {
    return <Rss className={`${className} text-muted-foreground shrink-0`} />;
  }

  return (
    <img
      src={faviconUrl}
      alt=""
      className={`${className} shrink-0 rounded-sm`}
      onError={() => setFailed(true)}
    />
  );
}
