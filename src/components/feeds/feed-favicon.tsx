import { useState } from "react";
import { Globe } from "lucide-react";

interface FeedFaviconProps {
  siteUrl: string;
  className?: string;
}

/** Displays a feed's favicon with a fallback globe icon. */
export function FeedFavicon({ siteUrl, className = "size-4" }: FeedFaviconProps) {
  const [failed, setFailed] = useState(false);

  if (!siteUrl || failed) {
    return <Globe className={`${className} text-muted-foreground shrink-0`} />;
  }

  let faviconUrl: string;
  try {
    const url = new URL(siteUrl);
    faviconUrl = `${url.origin}/favicon.ico`;
  } catch {
    return <Globe className={`${className} text-muted-foreground shrink-0`} />;
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
