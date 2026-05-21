import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { RefreshCw, Sparkles } from "lucide-react";
import { useSignalStore } from "@/stores/signal-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import {
  SIGNAL_ARTICLES_PER_TOPIC,
  SIGNAL_CORPUS_GATE,
  type SignalReport,
  type Topic,
  type WindowChoice,
} from "@/core/signal/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { formatRelative } from "@/lib/format-relative.ts";
import type { Article, Feed } from "@/types/index.ts";

/**
 * Signal — Phase 1.
 *
 * Plain-text ranked list of topics emerging across the user's feeds,
 * derived from cross-feed term frequency. No cards, no images, no LLM.
 * Three states: locked (corpus < gate), empty-but-ready (no cross-feed
 * signal), ready (topics + article rows).
 */
export function SignalPage() {
  const status = useSignalStore((s) => s.status);
  const report = useSignalStore((s) => s.report);
  const corpusSize = useSignalStore((s) => s.corpusSize);
  const error = useSignalStore((s) => s.error);
  const loadReport = useSignalStore((s) => s.loadReport);

  // Re-run when articles change so adding feeds / new items flips the
  // locked → ready transition without a manual refresh.
  const totalArticles = useArticleStore(
    (s) => Object.values(s.articlesByFeedId).reduce((n, list) => n + list.length, 0),
  );

  useEffect(() => {
    void loadReport();
  }, [loadReport, totalArticles]);

  if (status === "locked") {
    return <LockedTile count={corpusSize} />;
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

function LockedTile({ count }: { count: number }) {
  const pct = Math.min(100, Math.round((count / SIGNAL_CORPUS_GATE) * 100));
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 p-12 text-center">
      <Sparkles className="size-8 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">Signal</h1>
      <p className="text-3xl tabular-nums text-muted-foreground">
        <span className="text-foreground">{`${count} / ${SIGNAL_CORPUS_GATE}`}</span>
        {" articles"}
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: `${pct}%` }}
          aria-label={`${count} of ${SIGNAL_CORPUS_GATE}`}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Signal needs noise to filter — come back at {SIGNAL_CORPUS_GATE}.
      </p>
    </div>
  );
}

function ReadyView({
  report,
  onRefresh,
}: {
  report: SignalReport;
  onRefresh: () => void;
}) {
  const feeds = useFeedStore((s) => s.feeds);
  const feedMap = useMemo(() => indexFeeds(feeds), [feeds]);
  const articlesByFeedId = useArticleStore((s) => s.articlesByFeedId);
  const articleMap = useMemo(() => indexArticles(articlesByFeedId), [articlesByFeedId]);

  const hasTopics = report.topics.length > 0;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3 text-sm text-muted-foreground">
          <h1 className="text-xl font-semibold text-foreground">Signal</h1>
          <span>·</span>
          <span>{windowLabel(report.window)}</span>
          <span>·</span>
          <span>{report.corpusInWindow} articles</span>
          <span>·</span>
          <span>{report.feedsInWindow} feeds</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} aria-label="Refresh">
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </header>

      {!hasTopics ? (
        <p className="text-muted-foreground">No clear signal in your feeds right now.</p>
      ) : (
        <div className="flex flex-col gap-8">
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
  const navigate = useNavigate();
  const articles = topic.articleIds
    .slice(0, SIGNAL_ARTICLES_PER_TOPIC)
    .map((id) => articleMap.get(id))
    .filter((a): a is Article => a !== undefined);

  return (
    <section>
      <header className="mb-2 flex items-baseline gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
          {topic.displayTerm}
        </span>
        <span className="text-xs text-muted-foreground">
          {articles.length} article{articles.length === 1 ? "" : "s"} across {topic.feedCount} feed{topic.feedCount === 1 ? "" : "s"}
        </span>
      </header>
      <ul className="flex flex-col gap-1">
        {articles.map((article) => {
          const feed = feedMap.get(article.feedId);
          return (
            <li key={article.id} className="flex items-baseline justify-between gap-4 py-1">
              <button
                type="button"
                onClick={() => navigate(`/feeds/${article.feedId}/articles/${article.id}`)}
                className="text-left text-sm text-foreground hover:underline"
              >
                {article.title}
              </button>
              <span className="shrink-0 text-xs text-muted-foreground">
                {feed?.title ?? ""}
                {feed ? " · " : ""}
                {formatRelative(article.publishedAt, now)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
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
