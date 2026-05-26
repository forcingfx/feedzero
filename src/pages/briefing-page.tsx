/**
 * Briefing page — `/briefings/:briefingId` (or `/briefings` for the index).
 *
 * Renders inside the StageView slot of AppLayout. Reads from
 * briefing-store + article-store + license-store; routes to the right
 * splash based on per-briefing status (no-api-key, not-enough-evidence,
 * loading, error) or renders the ready view when there's a cached report.
 *
 * The Refresh button is the only path to an LLM call. We pass the full
 * article corpus to refreshBriefingFlow, which runs the local matcher +
 * signal-score gate before touching the network. That's how a BYO-key
 * feature stays under explicit user control while still letting the
 * sidebar dot flag stale briefings.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  RefreshCw,
  Trash2,
  Plus,
  KeyRound,
  Sparkles,
  Settings as SettingsIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useBriefingStore } from "@/stores/briefing-store";
import { useArticleStore } from "@/stores/article-store";
import { useFeedStore } from "@/stores/feed-store";
import { useFeatureGate } from "@/hooks/use-feature-gate";
import { UpgradeSplash } from "@/components/features/upgrade-splash.tsx";
import { SignalScoreGauge } from "@/components/briefings/signal-score-gauge";
import { BriefingAbstract } from "@/components/briefings/briefing-abstract";
import { CitationsList } from "@/components/briefings/citations-list";
import { SuggestedFeedsList } from "@/components/briefings/suggested-feeds-list";
import { NewBriefingDialog } from "@/components/briefings/new-briefing-dialog";
import { BriefingGeneratingSkeleton } from "@/components/briefings/briefing-generating-skeleton";
import { SignalTabs } from "@/components/signal/signal-tabs";
import { goToBriefing } from "@/lib/go-to-briefing";
import { goToSettings } from "@/lib/go-to-settings";
import { useBriefingModelPreference } from "@/lib/briefing-model-preference";
import type { Article, Briefing } from "@feedzero/core/types";
import { toast } from "sonner";

function collectAllArticles(byFeedId: Record<string, Article[]>): Article[] {
  const out: Article[] = [];
  for (const list of Object.values(byFeedId)) out.push(...list);
  return out;
}

export function BriefingPage() {
  const gate = useFeatureGate("signal-briefings");
  const navigate = useNavigate();
  const { briefingId } = useParams();
  const briefings = useBriefingStore((s) => s.briefings);
  const isLoading = useBriefingStore((s) => s.isLoading);
  const statusById = useBriefingStore((s) => s.statusById);
  const errorById = useBriefingStore((s) => s.errorById);
  const pendingScoreById = useBriefingStore((s) => s.pendingScoreById);
  const loadingStartedAtById = useBriefingStore((s) => s.loadingStartedAtById);
  const loadBriefings = useBriefingStore((s) => s.loadBriefings);
  const refresh = useBriefingStore((s) => s.refreshBriefing);
  const removeBriefing = useBriefingStore((s) => s.removeBriefing);
  const articlesByFeedId = useArticleStore((s) => s.articlesByFeedId);
  const feeds = useFeedStore((s) => s.feeds);
  const [preferredModel] = useBriefingModelPreference();
  const [showNewDialog, setShowNewDialog] = useState(false);

  useEffect(() => {
    void loadBriefings();
  }, [loadBriefings]);

  const briefing = useMemo(
    () => briefings.find((b) => b.id === briefingId) ?? null,
    [briefings, briefingId],
  );

  // Derive per-briefing UI status. Falls back to "idle" + undefined
  // when briefing isn't loaded yet so the hooks below stay
  // unconditional — Rules of Hooks require every hook (and every
  // hook-derived value used by the next hook) to run on every render.
  // Without this, the early returns lower down skip hooks on the
  // first render and then call them on the second, which React
  // detects and surfaces as a blank-screen crash.
  const status = briefing ? (statusById.get(briefing.id) ?? "idle") : "idle";
  const error = briefing ? errorById.get(briefing.id) : undefined;
  const pendingScore = briefing
    ? pendingScoreById.get(briefing.id)
    : undefined;
  // Read from the store, not local React state, so the elapsed-time
  // counter survives navigating away from /briefings/:id and back —
  // unmount/remount would otherwise reset it to "now" and the skeleton
  // would lie about how long the refresh has actually been running.
  const loadingStartedAt = briefing
    ? (loadingStartedAtById.get(briefing.id) ?? null)
    : null;

  // Gate-locked users see the matrix-derived upgrade splash.
  if (!gate.enabled) {
    return (
      <>
        <SignalTabs active="briefings" />
        <UpgradeSplash feature="signal-briefings" />
      </>
    );
  }

  // Index view: no briefingId in the URL.
  if (!briefingId) {
    return (
      <>
        <SignalTabs active="briefings" />
        <BriefingIndex
          briefings={briefings}
          onPick={(id) => goToBriefing(navigate, id)}
          onNew={() => setShowNewDialog(true)}
          isLoading={isLoading}
          showNewDialog={showNewDialog}
          setShowNewDialog={setShowNewDialog}
        />
      </>
    );
  }

  if (!briefing) {
    return (
      <>
        <SignalTabs active="briefings" />
        <div className="mx-auto max-w-2xl space-y-3 p-8 text-center">
          <p className="text-muted-foreground">Briefing not found.</p>
          <Button variant="outline" onClick={() => goToBriefing(navigate)}>
            Back to briefings
          </Button>
        </div>
      </>
    );
  }

  async function handleRefresh() {
    if (!briefing) return;
    const articles = collectAllArticles(articlesByFeedId);
    await refresh(briefing.id, {
      articles,
      modelId: preferredModel,
      bridgesEnabled: feeds.length > 0, // gate is honored upstream
    });
  }

  async function handleDelete() {
    if (!briefing) return;
    await removeBriefing(briefing.id);
    toast.success("Briefing deleted");
    goToBriefing(navigate);
  }


  return (
    <>
      <SignalTabs active="briefings" />
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <BriefingHeader
          briefing={briefing}
          status={status}
          onRefresh={() => void handleRefresh()}
          onDelete={() => void handleDelete()}
        />

      {status === "loading" && (
        <BriefingGeneratingSkeleton startedAt={loadingStartedAt ?? Date.now()} />
      )}

      {status === "no-api-key" && <NoApiKeySplash />}

      {status === "no-articles" && (
        <EmptySplash
          title="No articles to brief from"
          body="Add a few feeds first — briefings draw from your subscribed feeds."
          actionLabel="Browse Explore"
          onAction={() => navigate("/explore")}
        />
      )}

      {status === "not-enough-evidence" && pendingScore !== undefined && (
        <NotEnoughEvidenceSplash
          score={pendingScore}
          onEditPrompt={() => toast.info("Editing briefings — coming soon. For now, delete and recreate.")}
          onBrowseExplore={() => navigate("/explore")}
        />
      )}

      {status === "error" && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <p className="font-medium text-destructive">Refresh failed</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      )}

      {briefing.lastReport && (status === "ready" || status === "idle" || status === "error") && (
        <BriefingReadyView briefing={briefing} />
      )}

      {!briefing.lastReport && status === "idle" && (
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
          <Sparkles className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Ready to generate</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Click Refresh to produce the first briefing from your current feeds.
          </p>
        </div>
      )}
      </div>
    </>
  );
}

interface IndexProps {
  briefings: Briefing[];
  onPick: (id: string) => void;
  onNew: () => void;
  isLoading: boolean;
  showNewDialog: boolean;
  setShowNewDialog: (open: boolean) => void;
}

function BriefingIndex({
  briefings,
  onPick,
  onNew,
  isLoading,
  showNewDialog,
  setShowNewDialog,
}: IndexProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Signal Briefings</h1>
        <Button onClick={onNew}>
          <Plus className="size-4" />
          New briefing
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Standing briefings on the topics you care about, written from your own
        feeds. Bring your own Claude API key — FeedZero never sees your prompts
        or articles.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading briefings...</p>
      ) : briefings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <Sparkles className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-4 text-base font-medium">No briefings yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first briefing to get a recurring, cited summary of
            anything covered across your feeds.
          </p>
          <Button className="mt-4" onClick={onNew}>
            <Plus className="size-4" />
            Create a briefing
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {briefings.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onPick(b.id)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4 text-left hover:bg-accent"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium">{b.name}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {b.prompt}
                  </p>
                </div>
                {b.staleArticleCount > 0 && (
                  <span className="ml-3 shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    {b.staleArticleCount} new
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <NewBriefingDialog open={showNewDialog} onOpenChange={setShowNewDialog} />
    </div>
  );
}

function BriefingHeader({
  briefing,
  status,
  onRefresh,
  onDelete,
}: {
  briefing: Briefing;
  status: ReturnType<typeof useBriefingStore.getState>["statusById"] extends Map<
    string,
    infer V
  >
    ? V
    : never;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const setDailyRefresh = useBriefingStore((s) => s.setBriefingDailyRefresh);
  const lastRunLabel = briefing.lastRunAt
    ? new Date(briefing.lastRunAt).toLocaleString()
    : "never";
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{briefing.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{briefing.prompt}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={status === "loading"}
          >
            <RefreshCw
              className={status === "loading" ? "size-4 animate-spin" : "size-4"}
            />
            Refresh
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                aria-label="Delete briefing"
              >
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete briefing?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the saved prompt and its cached report. The
                  underlying articles in your feeds are untouched.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Last refreshed: {lastRunLabel}
        </p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={briefing.dailyRefresh === true}
            onCheckedChange={(v) => void setDailyRefresh(briefing.id, !!v)}
            aria-label="Refresh this briefing nightly"
          />
          <span>Refresh nightly</span>
        </label>
      </div>
    </div>
  );
}

function BriefingReadyView({ briefing }: { briefing: Briefing }) {
  const report = briefing.lastReport;
  if (!report) return null;
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <SignalScoreGauge score={report.signalScore} />
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Briefing
        </h2>
        <BriefingAbstract
          abstract={report.abstract}
          citations={report.citations}
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Citations
        </h2>
        <CitationsList citations={report.citations} />
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Suggested feeds
        </h2>
        <SuggestedFeedsList suggestions={report.suggestedFeeds} />
      </section>
      <p className="text-xs text-muted-foreground">
        Generated by {report.modelId} · {report.tokenUsage.input + report.tokenUsage.output} tokens
      </p>
    </div>
  );
}

function NoApiKeySplash() {
  const navigate = useNavigate();
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center">
      <KeyRound className="mx-auto size-10 text-muted-foreground" />
      <p className="mt-4 text-base font-medium">No Anthropic API key</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Briefings need a Claude API key. Paste yours in Settings — it&apos;s
        encrypted at rest and never leaves your browser except to call Anthropic
        directly.
      </p>
      <Button className="mt-4" onClick={() => goToSettings(navigate, "reading")}>
        <SettingsIcon className="size-4" />
        Open Settings
      </Button>
    </div>
  );
}

function EmptySplash({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center">
      <Sparkles className="mx-auto size-10 text-muted-foreground" />
      <p className="mt-4 text-base font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <Button className="mt-4" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}

function NotEnoughEvidenceSplash({
  score,
  onEditPrompt,
  onBrowseExplore,
}: {
  score: number;
  onEditPrompt: () => void;
  onBrowseExplore: () => void;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div>
        <p className="text-base font-medium">Not enough evidence yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Your feeds don&apos;t cover this topic strongly enough for a
          confident briefing. Add more sources or rephrase the prompt — then
          refresh.
        </p>
      </div>
      <SignalScoreGauge score={score} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onEditPrompt}>
          Edit prompt
        </Button>
        <Button onClick={onBrowseExplore}>
          <Plus className="size-4" />
          Add feeds
        </Button>
      </div>
    </div>
  );
}
