import { useState, useEffect } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
} from "@/components/ui/dialog.tsx";
import { XIcon, Search, CheckCheck, Zap, Shield, ArrowDownToLine, ArrowUpFromLine, Rss, Moon, BookOpen, ArrowLeft } from "lucide-react";
import { Kbd } from "@/components/ui/kbd.tsx";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";

export const APP_VERSION = "0.2.1";

const STORAGE_KEY = "feedzero:last-seen-version";

/** Returns true if the user hasn't seen the current version's changelog. */
export function shouldShowChangelog(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== APP_VERSION;
  } catch {
    return false;
  }
}

/** Marks the current version's changelog as seen. */
export function markChangelogSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, APP_VERSION);
  } catch {
    // localStorage unavailable
  }
}

interface ChangelogBentoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

// --- Tiles ---

function ExploreTile() {
  const feeds = [
    { name: "Ars Technica", site: "https://arstechnica.com", selected: false },
    { name: "Hacker News", site: "https://news.ycombinator.com", selected: true },
    { name: "The Verge", site: "https://theverge.com", selected: false },
    { name: "NPR", site: "https://npr.org", selected: false },
    { name: "Reuters", site: "https://reuters.com", selected: false },
    { name: "Wired", site: "https://wired.com", selected: false },
  ];

  const topics = ["Tech", "Science", "World", "Business", "Culture"];

  return (
    <BentoTile className="sm:col-span-2">
      <TileLabel isNew>Discover 1,000+ feeds</TileLabel>
      <TileDesc>Search by topic or country. Paste a URL to add anything.</TileDesc>
      <div className="mt-3 relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/50" />
        <div className="w-full rounded-md border border-border/50 bg-muted/20 px-3 py-1.5 pl-8 text-xs text-muted-foreground">
          nytimes.com/feed
        </div>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-primary">
          Enter to add
        </span>
      </div>
      <div className="mt-2 flex gap-1.5 flex-wrap">
        {topics.map((t) => (
          <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{t}</span>
        ))}
      </div>
      <div className="mt-2 rounded-md border border-border/30 overflow-hidden">
        {feeds.map((feed, i) => (
          <div
            key={feed.name}
            className={`flex items-center gap-2.5 px-2.5 py-1.5 text-xs ${
              feed.selected ? "bg-accent" : ""
            } ${i > 0 ? "border-t border-border/20" : ""}`}
          >
            <FeedFavicon siteUrl={feed.site} className="size-3.5" />
            <span className="flex-1">{feed.name}</span>
            {feed.selected && (
              <span className="text-[10px] text-muted-foreground">
                <Kbd className="h-4 text-[9px] px-1">Enter</Kbd>
              </span>
            )}
          </div>
        ))}
      </div>
    </BentoTile>
  );
}

function KeyboardTile() {
  const rows = [
    { keys: ["j", "k", "↑", "↓"], label: "Navigate" },
    { keys: ["Enter"], label: "Add feed" },
    { keys: ["p"], label: "Preview" },
    { keys: ["/"], label: "Search" },
    { keys: ["Space"], label: "Scroll article" },
    { keys: ["h"], label: "Full text view" },
    { keys: ["o"], label: "Open original" },
    { keys: [isMac ? "⌘," : "Ctrl+,"], label: "Settings" },
  ];

  return (
    <BentoTile>
      <TileLabel isNew>Keyboard everything</TileLabel>
      <TileDesc>Never leave the keyboard. Every action has a shortcut.</TileDesc>
      <div className="mt-3 space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center [&>*]:flex-1 text-xs">
            <span className="text-muted-foreground">{row.label}</span>
            <div className="flex items-center gap-1">
              {row.keys.map((k) => (
                <Kbd key={k} className="h-4 text-[9px] px-1.5">{k}</Kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </BentoTile>
  );
}

function UnreadTile() {
  const initial = [
    { title: "OpenAI announces GPT-5", unread: true },
    { title: "EU passes new AI regulation", unread: true },
    { title: "Rust 2.0 released", unread: true },
    { title: "SpaceX lands successfully", unread: false },
    { title: "Yesterday's weather report", unread: false },
  ];
  const [articles, setArticles] = useState(initial);
  const [fadeIndex, setFadeIndex] = useState(-1);

  useEffect(() => {
    const unreadIndices = initial
      .map((a, i) => (a.unread ? i : -1))
      .filter((i) => i >= 0);
    let step = 0;

    function tick() {
      if (step < unreadIndices.length) {
        setFadeIndex(unreadIndices[step]);
        setTimeout(() => {
          setArticles((prev) =>
            prev.map((a, i) =>
              i === unreadIndices[step] ? { ...a, unread: false } : a,
            ),
          );
          step++;
          setTimeout(tick, 800);
        }, 600);
      } else {
        // Reset after pause
        setTimeout(() => {
          setArticles(initial);
          setFadeIndex(-1);
          step = 0;
          setTimeout(tick, 1000);
        }, 2000);
      }
    }

    const start = setTimeout(tick, 1500);
    return () => clearTimeout(start);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BentoTile>
      <TileLabel isNew>Unread at a glance</TileLabel>
      <TileDesc>A blue dot marks what&apos;s new. Fades after you read it.</TileDesc>
      <div className="mt-3 rounded-md border border-border/30 overflow-hidden">
        {articles.map((a, i) => (
          <div
            key={a.title}
            className={`flex items-center gap-2.5 px-2.5 py-1.5 text-xs ${
              i > 0 ? "border-t border-border/20" : ""
            }`}
          >
            <span
              className={`rounded-full size-1.5 shrink-0 transition-opacity duration-500 ${
                a.unread ? "bg-blue-400 dark:bg-blue-500" : "bg-blue-400 dark:bg-blue-500"
              }`}
              style={{ opacity: a.unread ? 1 : fadeIndex === i ? 0.3 : 0 }}
            />
            <span>{a.title}</span>
          </div>
        ))}
      </div>
    </BentoTile>
  );
}

function MarkAllReadTile() {
  const titles = ["Breaking news update", "Weekly digest", "New release"];
  const [allRead, setAllRead] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setAllRead((r) => !r), 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <BentoTile>
      <TileLabel isNew>Mark all read</TileLabel>
      <TileDesc>Clear the queue in one click. Unread count always visible.</TileDesc>
      <div className="mt-3 rounded-md border border-border/30 overflow-hidden">
        <div className="flex items-center justify-between px-2.5 py-1.5 text-xs text-muted-foreground border-b border-border/20">
          <span className="transition-opacity duration-300">
            {allRead ? "All read" : "3 unread"}
          </span>
          <div className="flex items-center gap-1 text-foreground">
            <CheckCheck className={`size-3 transition-colors duration-300 ${allRead ? "text-emerald-500" : ""}`} />
            <span className="text-[11px]">Mark all read</span>
          </div>
        </div>
        {titles.map((title, i) => (
          <div key={title} className={`flex items-center gap-2.5 px-2.5 py-1.5 text-xs ${i > 0 ? "border-t border-border/20" : ""}`}>
            <span
              className="rounded-full size-1.5 shrink-0 bg-blue-400 dark:bg-blue-500 transition-opacity duration-500"
              style={{ opacity: allRead ? 0 : 1, transitionDelay: `${i * 100}ms` }}
            />
            <span className="text-muted-foreground">{title}</span>
          </div>
        ))}
      </div>
    </BentoTile>
  );
}

function InstantSwitchTile() {
  return (
    <BentoTile>
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center size-8 rounded-lg bg-amber-500/10 shrink-0">
          <Zap className="size-4 text-amber-500 animate-pulse" style={{ animationDuration: "2s" }} />
        </div>
        <div>
          <TileLabel isNew>Instant switching</TileLabel>
          <TileDesc>Feeds cached in memory. No spinners.</TileDesc>
        </div>
      </div>
    </BentoTile>
  );
}

function SyncTile() {
  const words = ["oak", "sun", "fox", "bell"];
  const allChars = words.join(" ");
  const nonSpaceCount = allChars.replace(/ /g, "").length;
  const [masked, setMasked] = useState(0);

  useEffect(() => {
    if (masked >= nonSpaceCount) return;
    const timeout = setTimeout(() => setMasked((m) => m + 1), 120);
    return () => clearTimeout(timeout);
  }, [masked, nonSpaceCount]);

  function replay() {
    setMasked(0);
  }

  return (
    <BentoTile>
      <TileLabel>Always private</TileLabel>
      <TileDesc>Sync with a 4-word passphrase. The server never sees your feeds.</TileDesc>
      <div className="mt-3 rounded-md border border-border/30 px-2.5 py-2 cursor-pointer" onMouseEnter={replay}>
        <div className="flex flex-wrap justify-center gap-1.5">
          {(() => {
            let charIndex = 0;
            return words.map((word, wi) => (
              <span
                key={wi}
                className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-600 dark:text-emerald-400"
              >
                {word.split("").map((ch, ci) => {
                  const idx = charIndex++;
                  return <span key={ci}>{idx < masked ? "*" : ch}</span>;
                })}
              </span>
            ));
          })()}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
          <span className="rounded-full size-1.5 bg-amber-500" />
          Local
        </span>
        <span className="text-muted-foreground/40">→</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
          <Shield className="size-3" />
          Synced
        </span>
      </div>
    </BentoTile>
  );
}

function OPMLTile() {
  const readers = [
    { name: "Feedly", site: "https://feedly.com" },
    { name: "Inoreader", site: "https://inoreader.com" },
    { name: "NewsBlur", site: "https://newsblur.com" },
    { name: "Miniflux", site: "https://miniflux.app" },
  ];

  return (
    <BentoTile>
      <TileLabel isNew>OPML import &amp; export</TileLabel>
      <TileDesc>Bring feeds from any reader. Take them when you leave.</TileDesc>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border/30 px-3 py-2.5">
          <div className="flex items-center justify-center size-8 rounded-lg bg-blue-500/10">
            <ArrowDownToLine className="size-4 text-blue-500 animate-bounce" style={{ animationDuration: "2s" }} />
          </div>
          <span className="text-[10px] text-muted-foreground">Import</span>
        </div>
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border/30 px-3 py-2.5">
          <div className="flex items-center justify-center size-8 rounded-lg bg-blue-500/10">
            <ArrowUpFromLine className="size-4 text-blue-500 animate-bounce" style={{ animationDuration: "2s", animationDelay: "0.3s" }} />
          </div>
          <span className="text-[10px] text-muted-foreground">Export</span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 justify-center">
        {readers.map((r) => (
          <div key={r.name} className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5">
            <FeedFavicon siteUrl={r.site} className="size-3" />
            <span className="text-[10px] text-muted-foreground">{r.name}</span>
          </div>
        ))}
      </div>
    </BentoTile>
  );
}

// --- v0.2.1 tiles ---

function V021Content() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:items-stretch">
      <div className="flex flex-col gap-3 [&>*]:flex-1">
        <BentoTile className="sm:col-span-1">
          <TileLabel isNew>Warm palette</TileLabel>
          <TileDesc>Subtle warm background tint and blue-indigo accents. Easier on the eyes.</TileDesc>
          <div className="mt-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="size-4 rounded" style={{ background: "oklch(0.995 0.003 80)" }} />
              <span className="text-muted-foreground">Warm background</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="size-4 rounded" style={{ background: "oklch(0.96 0.012 270)" }} />
              <span className="text-muted-foreground">Indigo accent</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="size-4 rounded" style={{ background: "oklch(0.55 0.15 270)" }} />
              <span className="text-muted-foreground">Focus ring</span>
            </div>
          </div>
        </BentoTile>
        <BentoTile>
          <TileLabel isNew>Smooth transitions</TileLabel>
          <TileDesc>Hover, select, and sidebar collapse all animate smoothly. Buttons press in on click.</TileDesc>
        </BentoTile>
      </div>
      <div className="flex flex-col gap-3 [&>*]:flex-1">
        <BentoTile>
          <TileLabel isNew>Reader polish</TileLabel>
          <TileDesc>Refined blockquotes, framed images, gradient rules, and elegant link underlines.</TileDesc>
          <div className="mt-3 rounded-md border border-border/30 overflow-hidden">
            <div className="px-3 py-2 text-xs">
              <div className="border-l-3 border-primary/30 bg-muted/20 pl-3 py-1 italic text-muted-foreground rounded-r text-[11px]">
                &ldquo;The details are not the details. They make the design.&rdquo;
              </div>
            </div>
          </div>
        </BentoTile>
        <BentoTile>
          <TileLabel isNew>Read vs unread</TileLabel>
          <TileDesc>Unread titles are bold. Read titles dim. Selected articles get an accent bar.</TileDesc>
          <div className="mt-3 rounded-md border border-border/30 overflow-hidden">
            <div className="flex items-center gap-2.5 px-2.5 py-1.5 text-xs border-l-2 border-l-primary bg-accent">
              <span className="rounded-full size-1.5 bg-blue-400" />
              <span className="font-medium">New article (unread)</span>
            </div>
            <div className="flex items-center gap-2.5 px-2.5 py-1.5 text-xs border-t border-border/20">
              <span className="rounded-full size-1.5 bg-transparent" />
              <span className="text-foreground/70">Yesterday&apos;s news (read)</span>
            </div>
          </div>
        </BentoTile>
      </div>
      <div className="flex flex-col gap-3 [&>*]:flex-1">
        <BentoTile>
          <TileLabel isNew>Editorial typography</TileLabel>
          <TileDesc>Tighter tracking on titles, relaxed line-height for reading, refined metadata.</TileDesc>
          <div className="mt-3 text-center">
            <div className="text-lg font-semibold tracking-tight">Headline</div>
            <div className="text-[10px] tracking-wide text-muted-foreground mt-1">Author &bull; Mar 28, 2026</div>
          </div>
        </BentoTile>
        <BentoTile>
          <TileLabel isNew>Accessibility</TileLabel>
          <TileDesc>Softer focus rings, reduced-motion support, and better contrast for read states.</TileDesc>
        </BentoTile>
      </div>
    </div>
  );
}

// --- v0.1.0 tiles ---

function V010Content() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:items-stretch">
      <div className="flex flex-col gap-3 [&>*]:flex-1">
        <BentoTile>
          <TileLabel>RSS, Atom &amp; JSON Feed</TileLabel>
          <TileDesc>Subscribe to any feed format. Paste a URL and go.</TileDesc>
          <div className="mt-3 rounded-md border border-border/30 overflow-hidden">
            {[
              { label: "RSS 2.0", icon: <Rss className="size-3.5 text-orange-500" /> },
              { label: "Atom 1.0", icon: <Rss className="size-3.5 text-blue-500" /> },
              { label: "JSON Feed", icon: <Rss className="size-3.5 text-amber-500" /> },
            ].map((f, i) => (
              <div key={f.label} className={`flex items-center gap-2.5 px-2.5 py-1.5 text-xs ${i > 0 ? "border-t border-border/20" : ""}`}>
                {f.icon}
                <span>{f.label}</span>
              </div>
            ))}
          </div>
        </BentoTile>
        <BentoTile>
          <TileLabel>Dark mode</TileLabel>
          <TileDesc>Easy on the eyes, day or night.</TileDesc>
          <div className="mt-3 flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-full border border-border/30 bg-muted/30 px-4 py-2 text-xs">
              <Moon className="size-3.5 text-indigo-400" />
              <span className="text-muted-foreground font-medium">Auto / Light / Dark</span>
            </div>
          </div>
        </BentoTile>
      </div>
      <div className="flex flex-col gap-3 [&>*]:flex-1">
        <BentoTile>
          <TileLabel>Zero-knowledge encryption</TileLabel>
          <TileDesc>Everything encrypted with AES-256 before it leaves your browser.</TileDesc>
          <div className="mt-3 flex items-center justify-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <Shield className="size-3" />
              AES-GCM-256
            </span>
          </div>
        </BentoTile>
        <BentoTile>
          <TileLabel>Cloud sync</TileLabel>
          <TileDesc>Sync across devices with a passphrase. We never see your data.</TileDesc>
          <div className="mt-3 rounded-md border border-border/30 px-2.5 py-2">
            <div className="flex flex-wrap justify-center gap-1.5">
              {["oak", "sun", "fox", "bell"].map((w) => (
                <span key={w} className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-600 dark:text-emerald-400">{w}</span>
              ))}
            </div>
          </div>
        </BentoTile>
      </div>
      <div className="flex flex-col gap-3 [&>*]:flex-1">
        <BentoTile>
          <TileLabel>Full-text extraction</TileLabel>
          <TileDesc>Feeds only show a summary? Extract the full article in one click.</TileDesc>
          <div className="mt-3 rounded-md border border-border/30 overflow-hidden">
            <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs bg-accent">
              <BookOpen className="size-3.5 text-primary" />
              <span className="font-medium">Full text</span>
            </div>
            <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground">
              Full article content appears here...
            </div>
          </div>
        </BentoTile>
        <BentoTile>
          <TileLabel>Keyboard navigation</TileLabel>
          <TileDesc>j/k to browse, o to open. Vim-style from day one.</TileDesc>
          <div className="mt-3 flex flex-wrap items-center gap-2 justify-center">
            {["j", "k", "o"].map((k) => (
              <Kbd key={k} className="h-5 text-[10px] px-2">{k}</Kbd>
            ))}
          </div>
        </BentoTile>
      </div>
    </div>
  );
}

// --- Shared components ---

function BentoTile({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border/50 bg-card p-4 shadow-md dark:shadow-lg dark:shadow-black/20 ${className}`}
    >
      {children}
    </div>
  );
}

function NewBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-blue-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white tracking-wide">
      new
    </span>
  );
}

function TileLabel({ children, isNew = false }: { children: React.ReactNode; isNew?: boolean }) {
  return (
    <h3 className="text-sm font-bold tracking-tight flex items-center gap-1.5">
      {children}
      {isNew && <NewBadge />}
    </h3>
  );
}

function TileDesc({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
      {children}
    </p>
  );
}

// --- Dialog ---

const releases = [
  {
    version: "0.2.1",
    date: "2026-03-28",
    title: "Visual polish",
    subtitle: "Warmer palette, smooth transitions, and a refined reading experience.",
  },
  {
    version: "0.2.0",
    date: "2026-03-28",
    title: "Find your next read",
    subtitle: "Discover feeds, navigate by keyboard, and keep your reading private.",
  },
  {
    version: "0.1.0",
    date: "2026-01-31",
    title: "A private RSS reader",
    subtitle: "Read feeds with end-to-end encryption. No accounts, no tracking.",
  },
];

export function ChangelogBentoDialog({
  open,
  onOpenChange,
}: ChangelogBentoProps) {
  const [releaseIndex, setReleaseIndex] = useState(0);
  const release = releases[releaseIndex];

  function handleOpenChange(value: boolean) {
    if (!value) {
      markChangelogSeen();
      setReleaseIndex(0);
    }
    onOpenChange(value);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-4xl max-h-[90vh] overflow-y-auto p-5 sm:p-8"
        showCloseButton={false}
      >
        <DialogClose
          tabIndex={-1}
          className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
        >
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogClose>

        <div className="text-center mb-5 sm:mb-6">
          {releaseIndex > 0 && (
            <button
              onClick={() => setReleaseIndex(0)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
            >
              <ArrowLeft className="size-3" />
              Back to latest
            </button>
          )}
          <p className="text-xs font-medium text-muted-foreground mb-1">
            v{release.version} &middot; {release.date}
          </p>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            {release.title}
          </h2>
          <p className="text-muted-foreground mt-1.5 text-xs sm:text-sm max-w-lg mx-auto">
            {release.subtitle}
          </p>
        </div>

        {releaseIndex === 0 ? (
          <V021Content />
        ) : releaseIndex === 1 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:items-stretch">
            <div className="flex flex-col gap-3 [&>*]:flex-1">
              <ExploreTile />
              <SyncTile />
            </div>
            <div className="flex flex-col gap-3 [&>*]:flex-1">
              <UnreadTile />
              <MarkAllReadTile />
              <InstantSwitchTile />
            </div>
            <div className="flex flex-col gap-3 [&>*]:flex-1">
              <KeyboardTile />
              <OPMLTile />
            </div>
          </div>
        ) : (
          <V010Content />
        )}

        <div className="flex items-center justify-between mt-5">
          {releaseIndex < releases.length - 1 ? (
            <button
              onClick={() => setReleaseIndex(releaseIndex + 1)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Previous release: v{releases[releaseIndex + 1].version}
            </button>
          ) : (
            <div />
          )}
          <span className="text-xs text-muted-foreground">
            <Kbd>Esc</Kbd> to dismiss
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
