import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Compass, FileUp, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useSignalStore } from "@/stores/signal-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import {
  SIGNAL_ARTICLES_PER_TOPIC,
  SIGNAL_CORPUS_GATE,
  type SignalReport,
  type Story,
  type Topic,
  type WindowChoice,
} from "@/core/signal/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { StoryRow } from "@/components/signal/story-row.tsx";
import { formatRelative } from "@/lib/format-relative.ts";
import { goToSettings } from "@/lib/go-to-settings.ts";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh.ts";
import { useFeatureGate } from "@/hooks/use-feature-gate.ts";
import { useIsDesktop } from "@/hooks/use-media-query.ts";
import { UpgradeSplash } from "@/components/features/upgrade-splash.tsx";
import type { Article, Feed } from "@/types/index.ts";

/**
 * Signal — Phase 1.
 *
 * Plain-text ranked list of topics emerging across the user's feeds,
 * derived from cross-feed term frequency. No cards, no images, no LLM.
 * Three states: locked (corpus < gate), empty-but-ready (no cross-feed
 * signal), ready (topics + article rows).
 *
 * Mobile-first: stacked layouts, full-width tap targets, pull-to-refresh.
 */
export function SignalPage() {
  const status = useSignalStore((s) => s.status);
  const report = useSignalStore((s) => s.report);
  const corpusSize = useSignalStore((s) => s.corpusSize);
  const error = useSignalStore((s) => s.error);
  const loadReport = useSignalStore((s) => s.loadReport);
  const gate = useFeatureGate("signal");

  const totalArticles = useArticleStore(
    (s) => Object.values(s.articlesByFeedId).reduce((n, list) => n + list.length, 0),
  );

  // Honor-system open-core gate. The sidebar entry stays visible for
  // discoverability; the page surfaces the upgrade affordance when the
  // user's tier doesn't include Signal. Self-hosters and pre-launch
  // builds (paid tier dormant) pass through via gate.enabled. See ADR 012.
  const tierLocked = !gate.enabled && gate.reason === "tier-locked";

  // Skip the (cheap, but pointless) engine run while gate-locked.
  useEffect(() => {
    if (tierLocked) return;
    void loadReport();
  }, [loadReport, totalArticles, tierLocked]);

  if (tierLocked) {
    return <UpgradeSplash feature="signal" />;
  }

  if (status === "locked") {
    return <LockedSplash count={corpusSize} />;
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-destructive">Couldn't generate signal: {error}</p>
      </div>
    );
  }

  if (status === "idle" || status === "loading" || !report) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-muted-foreground">
        Computing signal…
      </div>
    );
  }

  return <ReadyView report={report} onRefresh={() => loadReport({ force: true })} />;
}

function LockedSplash({ count }: { count: number }) {
  const navigate = useNavigate();
  const remaining = Math.max(0, SIGNAL_CORPUS_GATE - count);
  const pct = Math.min(100, Math.round((count / SIGNAL_CORPUS_GATE) * 100));
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <Sparkles className="size-10 text-primary" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Signal</h1>
        <p className="text-sm text-muted-foreground">
          What's loud across your feeds — the topics multiple outlets are
          converging on right now.
        </p>
      </div>
      <div className="w-full space-y-2">
        <p className="text-4xl font-semibold tabular-nums">
          {remaining > 0 ? remaining : 0}
          <span className="ml-2 text-base font-normal text-muted-foreground">
            {remaining === 1 ? "more article to unlock" : "more articles to unlock"}
          </span>
        </p>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={count}
          aria-valuemin={0}
          aria-valuemax={SIGNAL_CORPUS_GATE}
          aria-label={`${count} of ${SIGNAL_CORPUS_GATE} articles`}
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {`${count} of ${SIGNAL_CORPUS_GATE} articles in your store`}
        </p>
      </div>
      <div className="flex w-full flex-col gap-2 pt-2">
        <Button onClick={() => navigate("/explore")} className="w-full" size="lg">
          <Plus className="size-4" />
          Add feeds
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate("/explore")}
          className="w-full"
          size="lg"
        >
          <Compass className="size-4" />
          Browse the catalog
        </Button>
        <Button
          variant="ghost"
          onClick={() => goToSettings(navigate, "sync-and-data")}
          className="w-full"
          size="lg"
        >
          <FileUp className="size-4" />
          Import OPML
        </Button>
      </div>
    </div>
  );
}

function ReadyView({
  report,
  onRefresh,
}: {
  report: SignalReport;
  onRefresh: () => void | Promise<void>;
}) {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const feeds = useFeedStore((s) => s.feeds);
  const feedMap = useMemo(() => indexFeeds(feeds), [feeds]);
  const articlesByFeedId = useArticleStore((s) => s.articlesByFeedId);
  const articleMap = useMemo(() => indexArticles(articlesByFeedId), [articlesByFeedId]);

  const containerRef = useRef<HTMLDivElement>(null);
  const { pullPx, isRefreshing } = usePullToRefresh({
    scrollRef: containerRef,
    enabled: !isDesktop,
    onRefresh,
  });

  const hasTopics = report.topics.length > 0;
  const topStories = useMemo(() => collectTopStories(report.topics), [report.topics]);
  const generatedLabel = formatRelative(report.generatedAt);

  return (
    <div ref={containerRef} className="h-full overflow-y-auto">
      {!isDesktop && pullPx > 0 ? (
        <div
          className="flex items-center justify-center text-xs text-muted-foreground transition-[height]"
          style={{ height: Math.min(pullPx, 80) }}
        >
          <RefreshCw
            className={`size-4 ${isRefreshing ? "animate-spin" : ""}`}
            style={{ transform: `rotate(${Math.min(pullPx, 80) * 4.5}deg)` }}
          />
        </div>
      ) : null}

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-semibold">Signal</h1>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void onRefresh()}
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {`${windowLabel(report.window)} · ${report.corpusInWindow} articles · ${report.feedsInWindow} feeds${
              generatedLabel ? ` · updated ${generatedLabel}` : ""
            }`}
          </p>
        </header>

        {!hasTopics ? (
          <EmptyState onAddFeeds={() => navigate("/explore")} />
        ) : (
          <div className="flex flex-col gap-8">
            {topStories.length >= TOP_STORIES_MIN ? (
              <TopStoriesBlock
                stories={topStories}
                articleMap={articleMap}
                feedMap={feedMap}
                now={report.generatedAt}
              />
            ) : null}
            {report.topics.map((topic) => (
              <TopicBlock
                key={topic.term}
                topic={topic}
                articleMap={articleMap}
                feedMap={feedMap}
                now={report.generatedAt}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The Top stories digest only renders when at least this many stories
 * have multiple sources. One multi-source story isn't a "digest" — it's a
 * single row already visible in its topic — so the bar starts at two.
 */
const TOP_STORIES_MIN = 2;

/**
 * Collect stories with at least two sources across every topic, deduped
 * by id (the rare case where the same article is claimed by multiple
 * topics) and ordered outlet-count-desc — most-corroborated first.
 * Stories within a topic are already most-recent-first, which carries
 * through stable sort.
 */
function collectTopStories(topics: Topic[]): Story[] {
  const seen = new Set<string>();
  const out: Story[] = [];
  for (const topic of topics) {
    for (const story of topic.stories) {
      if (story.feedCount >= 2 && !seen.has(story.id)) {
        seen.add(story.id);
        out.push(story);
      }
    }
  }
  out.sort((a, b) => b.feedCount - a.feedCount);
  return out;
}

function TopStoriesBlock({
  stories,
  articleMap,
  feedMap,
  now,
}: {
  stories: Story[];
  articleMap: Map<string, Article>;
  feedMap: Map<string, Feed>;
  now: number;
}) {
  return (
    <section>
      <header className="mb-1.5">
        <h2 className="text-lg font-semibold leading-tight">Top stories</h2>
        <p className="text-xs text-muted-foreground">
          {`${stories.length} stories multiple outlets are running right now`}
        </p>
      </header>
      <ul className="divide-y divide-border">
        {stories.map((story) => (
          <StoryRow
            key={story.id}
            story={story}
            articleMap={articleMap}
            feedMap={feedMap}
            now={now}
          />
        ))}
      </ul>
    </section>
  );
}

function TopicBlock({
  topic,
  articleMap,
  feedMap,
  now,
}: {
  topic: Topic;
  articleMap: Map<string, Article>;
  feedMap: Map<string, Feed>;
  now: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded
    ? topic.stories
    : topic.stories.slice(0, SIGNAL_ARTICLES_PER_TOPIC);
  const hiddenCount = topic.totalStories - visible.length;

  return (
    <section>
      <header className="mb-1.5">
        <h2 className="text-lg font-semibold leading-tight">{topic.displayTerm}</h2>
        <p className="text-xs text-muted-foreground">
          {`${topic.totalArticlesInCluster} article${topic.totalArticlesInCluster === 1 ? "" : "s"} · ${topic.feedCount} outlet${topic.feedCount === 1 ? "" : "s"}`}
        </p>
      </header>
      <ul className="divide-y divide-border">
        {visible.map((story) => (
          <StoryRow
            key={story.id}
            story={story}
            articleMap={articleMap}
            feedMap={feedMap}
            now={now}
          />
        ))}
      </ul>
      {hiddenCount > 0 && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          {`+ ${hiddenCount} more`}
        </button>
      ) : null}
    </section>
  );
}

function EmptyState({ onAddFeeds }: { onAddFeeds: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed p-6">
      <p className="text-sm text-muted-foreground">
        No clear signal in your feeds right now. Signal needs a few outlets
        converging on the same story to surface a topic.
      </p>
      <Button variant="outline" onClick={onAddFeeds}>
        <Plus className="size-4" />
        Add more feeds
      </Button>
    </div>
  );
}

function windowLabel(window: WindowChoice): string {
  switch (window) {
    case "7d": return "Last 7 days";
    case "14d": return "Last 14 days";
    case "30d": return "Last 30 days";
    case "all": return "All time";
  }
}

function indexFeeds(feeds: Feed[]): Map<string, Feed> {
  return new Map(feeds.map((f) => [f.id, f]));
}

function indexArticles(byFeed: Record<string, Article[]>): Map<string, Article> {
  const out = new Map<string, Article>();
  for (const list of Object.values(byFeed)) {
    for (const a of list) out.set(a.id, a);
  }
  return out;
}
