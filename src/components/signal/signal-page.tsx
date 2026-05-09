import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { KeyRound, RefreshCw, Sparkles } from "lucide-react";
import { useSignalStore, type ResolvedTopStory } from "@/stores/signal-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { decodeEntities } from "@/lib/decode-entities.ts";
import { extractImage } from "@/lib/extract-image.ts";
import { formatRelative } from "@/lib/format-relative.ts";
import { SignalCard, type SignalCardVariant } from "./signal-card.tsx";
import { SwimlaneCard } from "./swimlane-card.tsx";
import type { Article, Feed } from "@/types/index.ts";

export function SignalPage() {
  const navigate = useNavigate();
  const apiKey = useSignalStore((s) => s.apiKey);
  const status = useSignalStore((s) => s.status);
  const topStories = useSignalStore((s) => s.topStories);
  const swimlanes = useSignalStore((s) => s.swimlanes);
  const error = useSignalStore((s) => s.error);
  const init = useSignalStore((s) => s.init);
  const loadFrontpage = useSignalStore((s) => s.loadFrontpage);
  const feeds = useFeedStore((s) => s.feeds);

  useEffect(() => {
    init();
    loadFrontpage();
  }, [init, loadFrontpage]);

  const feedMap = useMemo(() => indexFeeds(feeds), [feeds]);
  const [chooserStory, setChooserStory] = useState<ResolvedTopStory | null>(null);

  function openStory(story: ResolvedTopStory) {
    if (story.articles.length <= 1) {
      const article = story.articles[0];
      if (article) openArticle(article);
      return;
    }
    setChooserStory(story);
  }

  function openArticle(article: Article) {
    setChooserStory(null);
    navigate(`/feeds/${article.feedId}/articles/${article.id}`);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:py-10">
      <header className="mb-6 flex items-center gap-2">
        <Sparkles className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">Signal</h1>
        {apiKey && (
          <div className="ml-auto flex items-center gap-1">
            <RegenerateButton />
            <ManageKeyControl />
          </div>
        )}
      </header>

      <Body
        apiKey={apiKey}
        status={status}
        error={error}
        topStories={topStories}
        swimlanes={swimlanes}
        feedMap={feedMap}
        onOpenStory={openStory}
        onOpenArticle={openArticle}
      />

      <ClusterChooser
        story={chooserStory}
        feedMap={feedMap}
        onSelect={openArticle}
        onClose={() => setChooserStory(null)}
      />
    </div>
  );
}

function Body({
  apiKey,
  status,
  error,
  topStories,
  swimlanes,
  feedMap,
  onOpenStory,
  onOpenArticle,
}: {
  apiKey: string | null;
  status: ReturnType<typeof useSignalStore.getState>["status"];
  error: string | null;
  topStories: ReturnType<typeof useSignalStore.getState>["topStories"];
  swimlanes: ReturnType<typeof useSignalStore.getState>["swimlanes"];
  feedMap: Record<string, Feed>;
  onOpenStory: (s: ResolvedTopStory) => void;
  onOpenArticle: (a: Article) => void;
}) {
  if (!apiKey) return <NoKeyEmptyState />;
  if (status === "loading" || status === "idle") return <LoadingState feedMap={feedMap} />;
  if (status === "error") return <GenerationErrorState error={error} />;
  if (status === "no-content") return <NoContentEmptyState />;

  return (
    <>
      {topStories.length > 0 && (
        <div data-testid="cluster-masonry" className="columns-1 md:columns-3 gap-3 [column-fill:balance]">
          {orderForMasonry(topStories).map((story, index) => {
            const variant: SignalCardVariant = pickVariant(story, index);
            const card = (
              <SignalCard
                story={story}
                feeds={feedMap}
                variant={variant}
                onOpen={onOpenStory}
              />
            );
            if (variant === "hero") {
              return (
                <div
                  key={story.id}
                  data-testid="hero-wrapper"
                  className="mb-3 break-inside-avoid"
                  style={{ columnSpan: "all" }}
                >
                  {card}
                </div>
              );
            }
            return (
              <div key={story.id} className="mb-3 break-inside-avoid">
                {card}
              </div>
            );
          })}
        </div>
      )}

      {swimlanes.length > 0 && (
        <div className="mt-8 space-y-6">
          {swimlanes.map((lane) => (
            <section key={lane.id} data-testid="swimlane">
              <h2 className="text-lg font-semibold tracking-tight mb-3 px-1">
                {lane.title}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  · {lane.articles.length}
                </span>
              </h2>
              {lane.description && (
                <p className="text-sm text-muted-foreground mb-3 px-1">
                  {lane.description}
                </p>
              )}
              <div
                className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4"
                style={{ scrollbarWidth: "thin" }}
              >
                {lane.articles.map((article) => (
                  <SwimlaneCard
                    key={article.id}
                    article={article}
                    feed={feedMap[article.feedId]}
                    onOpen={onOpenArticle}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function pickVariant(story: ResolvedTopStory, index: number): SignalCardVariant {
  if (index === 0) return "hero";
  return storyHasImage(story) ? "tile" : "brief";
}

function orderForMasonry(stories: ResolvedTopStory[]): ResolvedTopStory[] {
  if (stories.length < 2) return stories;
  if (storyHasImage(stories[0])) return stories;
  const idx = stories.findIndex(storyHasImage);
  if (idx <= 0) return stories;
  const reordered = [...stories];
  [reordered[0], reordered[idx]] = [reordered[idx], reordered[0]];
  return reordered;
}

function storyHasImage(story: ResolvedTopStory): boolean {
  for (const article of story.articles) {
    if (extractImage(article)) return true;
  }
  return false;
}

function indexFeeds(feeds: Feed[]): Record<string, Feed> {
  const map: Record<string, Feed> = {};
  for (const feed of feeds) map[feed.id] = feed;
  return map;
}

function NoKeyEmptyState() {
  const setApiKey = useSignalStore((s) => s.setApiKey);
  const loadFrontpage = useSignalStore((s) => s.loadFrontpage);
  const [draft, setDraft] = useState("");

  function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setApiKey(trimmed);
    loadFrontpage();
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 p-8">
      <p className="text-base font-medium">Add an Anthropic API key to enable Signal.</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Signal sends article titles and snippets directly to Anthropic from your browser to
        produce a magazine-style frontpage. FeedZero's servers are never in the loop.{" "}
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          Get a key →
        </a>
      </p>
      <form onSubmit={save} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="block text-xs font-medium text-muted-foreground mb-1">
            Anthropic API key
          </span>
          <Input
            type="password"
            autoComplete="off"
            placeholder="sk-ant-…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={!draft.trim()}>Save</Button>
      </form>
    </div>
  );
}

function NoContentEmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
      <p className="text-base font-medium">Nothing to surface yet.</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Either your feed corpus is too thin or nothing in the last 24 hours rises to a frontpage.
        Try regenerating later.
      </p>
    </div>
  );
}

function GenerationErrorState({ error }: { error: string | null }) {
  const loadFrontpage = useSignalStore((s) => s.loadFrontpage);
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
      <p className="text-base font-medium">Couldn't generate Signal.</p>
      <p className="mt-2 text-sm text-muted-foreground">{error ?? "Try again in a moment."}</p>
      <Button className="mt-4" onClick={() => loadFrontpage({ force: true })}>
        Retry
      </Button>
    </div>
  );
}

function LoadingState({ feedMap }: { feedMap: Record<string, Feed> }) {
  const feeds = Object.values(feedMap);
  return (
    <div
      data-testid="signal-loading"
      className="rounded-lg border border-dashed border-border bg-card/50 px-6 py-12"
    >
      <div className="mx-auto max-w-xl text-center">
        <div className="flex flex-wrap justify-center gap-2 mb-5">
          {feeds.slice(0, 24).map((feed, i) => (
            <span
              key={feed.id}
              className="inline-flex animate-pulse"
              style={{ animationDelay: `${(i % 8) * 120}ms` }}
            >
              <FeedFavicon
                siteUrl={feed.siteUrl || feed.url}
                className="size-5"
                avatar
              />
            </span>
          ))}
        </div>
        <p className="text-sm font-medium">
          Reading {feeds.length} {feeds.length === 1 ? "feed" : "feeds"}…
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Anthropic is finding the day's most interesting stories across your sources.
          This usually takes a few seconds.
        </p>
      </div>
    </div>
  );
}

function RegenerateButton() {
  const status = useSignalStore((s) => s.status);
  const loadFrontpage = useSignalStore((s) => s.loadFrontpage);
  const isGenerating = status === "loading";
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isGenerating}
      onClick={() => loadFrontpage({ force: true })}
      aria-label="Regenerate frontpage"
    >
      <RefreshCw className={`size-4 ${isGenerating ? "animate-spin" : ""}`} />
      <span className="hidden sm:inline">Regenerate</span>
    </Button>
  );
}

function ManageKeyControl() {
  const setApiKey = useSignalStore((s) => s.setApiKey);
  const [open, setOpen] = useState(false);

  function disconnect() {
    setApiKey(null);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-label="Manage API key"
      >
        <KeyRound className="size-4" />
        <span className="hidden sm:inline">API key</span>
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 w-64 rounded-md border border-border bg-popover p-3 shadow-md">
          <p className="text-xs text-muted-foreground mb-2">
            Anthropic key configured. Disconnecting clears it from this device.
          </p>
          <Button variant="destructive" size="sm" onClick={disconnect}>
            Disconnect
          </Button>
        </div>
      )}
    </div>
  );
}

function ClusterChooser({
  story,
  feedMap,
  onSelect,
  onClose,
}: {
  story: ResolvedTopStory | null;
  feedMap: Record<string, Feed>;
  onSelect: (article: Article) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!story} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        data-testid="cluster-chooser"
        className="sm:max-w-lg max-h-[80vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Pick an article to read</DialogTitle>
        </DialogHeader>
        {story && (
          <ul className="-mx-2 mt-2 space-y-1">
            {story.articles.map((article) => {
              const feed = feedMap[article.feedId];
              return (
                <li key={article.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(article)}
                    className="w-full text-left rounded-md px-3 py-2.5 hover:bg-accent/60 transition-colors"
                  >
                    <div className="text-sm font-medium leading-snug">
                      {decodeEntities(article.title)}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      {feed && (
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <FeedFavicon
                            siteUrl={feed.siteUrl || feed.url}
                            className="size-3.5"
                          />
                          <span className="truncate max-w-[12rem]">{feed.title}</span>
                        </span>
                      )}
                      <span className="ml-auto shrink-0">
                        {formatRelative(article.publishedAt)}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
