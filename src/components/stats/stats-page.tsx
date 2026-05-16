import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { decodeEntities } from "@/lib/decode-entities.ts";

const TOP_FEED_LIMIT = 100;

interface CatalogFeedDTO {
  url: string;
  title: string | null;
  siteUrl: string | null;
  requestCount: number;
}

interface StatsData {
  vaults: number;
  totalFeeds: number;
  topFeeds: CatalogFeedDTO[];
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: StatsData }
  | { status: "error" };

export function StatsPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadAll()
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:py-10">
      <header className="mb-6 flex items-center gap-2">
        <BarChart3 className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">FeedZero stats</h1>
      </header>
      <p className="mb-6 text-sm text-muted-foreground">
        Aggregate, anonymous numbers — no per-user data, no cookies, no accounts.
        Updated on each page load.
      </p>

      {state.status === "loading" && <LoadingState />}
      {state.status === "error" && <ErrorState />}
      {state.status === "ready" && <ReadyState data={state.data} />}
    </div>
  );
}

function ReadyState({ data }: { data: StatsData }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <Stat label="Vaults" value={data.vaults} testId="stat-vaults" />
        <Stat label="Feeds tracked" value={data.totalFeeds} testId="stat-feeds" />
      </div>

      <h2 className="text-base font-semibold mb-3">Top feeds by request volume</h2>
      <div
        data-testid="stats-leaderboard"
        className="rounded-lg border border-border bg-card overflow-hidden"
      >
        {data.topFeeds.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No feed activity yet.</p>
        ) : (
          <ol>
            {data.topFeeds.map((feed, i) => (
              <li
                key={feed.url}
                className="flex items-center gap-3 border-b border-border last:border-0 px-3 py-2"
              >
                <span className="w-6 text-xs tabular-nums text-muted-foreground text-right">
                  {i + 1}
                </span>
                {feed.siteUrl ? (
                  <FeedFavicon siteUrl={feed.siteUrl} className="size-4" />
                ) : (
                  <div className="size-4 rounded-sm bg-muted" />
                )}
                <a
                  href={feed.siteUrl ?? feed.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 truncate text-sm hover:underline"
                >
                  {decodeEntities(feed.title ?? hostFromUrl(feed.url))}
                </a>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {feed.requestCount.toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div data-testid={testId} className="mt-1 text-3xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-64" />
    </>
  );
}

function ErrorState() {
  return (
    <div
      data-testid="stats-error"
      className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center"
    >
      <p className="text-base font-medium">Couldn't load stats.</p>
      <p className="mt-2 text-sm text-muted-foreground">Try refreshing the page.</p>
    </div>
  );
}

async function loadAll(): Promise<StatsData> {
  // /api/stats-sync is the only required endpoint — vault count is meaningful
  // local data that every deployment can resolve. The catalog endpoints are
  // optional: self-hosters who don't wire the Upstash catalog adapter get
  // 404s, and the page should still render rather than show a hard error.
  const [popular, count, sync] = await Promise.all([
    fetchJsonOptional<{ ok: boolean; feeds?: CatalogFeedDTO[]; error?: string }>(
      `/api/catalog?action=popular&limit=${TOP_FEED_LIMIT}`,
    ),
    fetchJsonOptional<{ ok: boolean; count?: number; error?: string }>(`/api/catalog?action=count`),
    fetchJson<{ ok: boolean; vaults?: number; error?: string }>(`/api/stats-sync`),
  ]);
  if (!sync.ok) throw new Error("stats endpoint failed");
  return {
    vaults: sync.vaults ?? 0,
    totalFeeds: count?.count ?? 0,
    topFeeds: popular?.feeds ?? [],
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Returns null on any error — for endpoints whose absence should be a soft
 * degradation, not a hard failure. */
async function fetchJsonOptional<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
