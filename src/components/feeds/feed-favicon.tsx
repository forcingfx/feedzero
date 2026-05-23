import { useMemo, useState, useSyncExternalStore } from "react";
import { Rss } from "lucide-react";
import {
  getFaviconGeneration,
  getFaviconStrategyIndex,
  recordFaviconFailure,
  recordFaviconSuccess,
  subscribeFaviconCache,
} from "@/core/favicon/favicon-cache.ts";

interface FeedFaviconProps {
  siteUrl: string;
  className?: string;
  /** Render as a circular, filled avatar (no border ring). Used on dark
   * surfaces like the Signal splash hero where the default ring looks ugly. */
  avatar?: boolean;
}

/**
 * Favicon URL strategies, tried in order.
 * "path:" entries append to the origin. "endpoint:" entries are called directly.
 */
type FaviconStrategy =
  | { type: "path"; path: string }
  | { type: "endpoint"; buildUrl: (origin: string) => string };

const STRATEGIES: FaviconStrategy[] = [
  {
    type: "endpoint",
    buildUrl: (origin) => {
      const host = new URL(origin).host;
      return `/api/favicon?domain=${encodeURIComponent(host)}`;
    },
  },
  { type: "path", path: "/favicon.ico" },
  { type: "path", path: "/favicon.png" },
  { type: "path", path: "/apple-touch-icon.png" },
];

/** Displays a feed's favicon with fallback chain, proxied through /api/icon. */
export function FeedFavicon({
  siteUrl,
  className = "size-4",
  avatar = false,
}: FeedFaviconProps) {
  const origin = useMemo(() => {
    try {
      return new URL(siteUrl).origin;
    } catch {
      return null;
    }
  }, [siteUrl]);

  // A refresh clears failed favicons and bumps the generation; re-evaluating
  // here lets favicons already on screen re-attempt, not just newly mounted ones.
  const generation = useSyncExternalStore(
    subscribeFaviconCache,
    getFaviconGeneration,
    getFaviconGeneration,
  );

  const [pathIndex, setPathIndex] = useState(() =>
    origin ? getFaviconStrategyIndex(origin) : 0,
  );
  const [loaded, setLoaded] = useState(false);
  const [seenGeneration, setSeenGeneration] = useState(generation);

  if (seenGeneration !== generation) {
    setSeenGeneration(generation);
    // Only restart resolution when THIS origin's cached strategy changed.
    // Successful favicons share the generation bump but shouldn't drop their
    // loaded state — otherwise a single cleared failure elsewhere makes every
    // mounted favicon flash to the RSS placeholder and re-hit /api/favicon on
    // each refresh-all. See issue #117.
    const next = origin ? getFaviconStrategyIndex(origin) : 0;
    if (next !== pathIndex) {
      setPathIndex(next);
      setLoaded(false);
    }
  }

  if (!origin || pathIndex < 0 || pathIndex >= STRATEGIES.length) {
    return <Rss className={`${className} text-muted-foreground shrink-0`} />;
  }

  const strategy = STRATEGIES[pathIndex];
  const faviconUrl =
    strategy.type === "path"
      ? `/api/icon?url=${encodeURIComponent(origin + strategy.path)}`
      : strategy.buildUrl(origin);

  return (
    <>
      {!loaded && (
        <Rss className={`${className} text-muted-foreground shrink-0`} />
      )}
      <img
        src={faviconUrl}
        alt=""
        className={`${className} shrink-0 ${
          avatar
            ? "rounded-full bg-white object-cover p-px"
            : "rounded-sm ring-1 ring-border/50"
        } ${loaded ? "" : "hidden"}`}
        onLoad={() => {
          recordFaviconSuccess(origin, pathIndex);
          setLoaded(true);
        }}
        onError={() => {
          const next = pathIndex + 1;
          if (next < STRATEGIES.length) {
            setPathIndex(next);
            setLoaded(false);
          } else {
            recordFaviconFailure(origin);
            setPathIndex(-1);
          }
        }}
      />
    </>
  );
}
