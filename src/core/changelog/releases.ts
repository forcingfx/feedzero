export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  subtitle: string;
  /** Bullet-point items for the summary view. */
  items: string[];
  /** Rich HTML content for the blog-style article (optional). */
  richContent?: string;
}

// --- Rich content blocks ---

const v031RichContent = `
<h2>A reader that gets out of the way</h2>
<p>Every pixel matters when you're reading. This release reclaims <strong>70+ pixels of vertical space</strong> on desktop by removing chrome you don't need.</p>

<div class="rounded-xl border border-blue-200 bg-blue-50 p-4 my-6">
  <div class="flex items-center gap-3 mb-3">
    <div class="flex items-center justify-center rounded-lg bg-blue-100 p-2">
      <span class="text-lg">📰</span>
    </div>
    <div>
      <div class="font-semibold text-sm">Know your source</div>
      <div class="text-xs text-blue-700">Every article now shows its feed's favicon and name right below the title.</div>
    </div>
  </div>
  <div class="rounded-lg border border-blue-200 bg-white p-3">
    <div class="text-lg font-semibold tracking-tight mb-1">Breaking: Major Discovery in Deep Space</div>
    <div class="flex items-center gap-2 text-xs text-gray-500">
      <div class="w-3.5 h-3.5 rounded-sm bg-orange-400"></div>
      <span class="font-medium text-gray-700">Ars Technica</span>
      <span>&bull;</span>
      <span>Apr 6, 2026, 2:30 PM</span>
    </div>
  </div>
</div>

<h3>Unread badges — always know what's fresh</h3>
<p>Each feed in the sidebar now shows a badge with its unread count. Counts are computed from the full article set, not just the first page. When you hover a feed, the badge fades and the action menu appears.</p>

<div class="flex gap-2 my-6">
  <div class="flex-1 rounded-xl border bg-white p-3">
    <div class="flex items-center gap-2 mb-2">
      <div class="w-3.5 h-3.5 rounded-sm bg-orange-400"></div>
      <span class="text-xs font-medium flex-1">Ars Technica</span>
      <span class="rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px] font-semibold">12</span>
    </div>
    <div class="flex items-center gap-2">
      <div class="w-3.5 h-3.5 rounded-sm bg-green-500"></div>
      <span class="text-xs font-medium flex-1">Hacker News</span>
      <span class="rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px] font-semibold">25+</span>
    </div>
    <div class="flex items-center gap-2 mt-2">
      <div class="w-3.5 h-3.5 rounded-sm bg-red-400"></div>
      <span class="text-xs font-medium flex-1 text-gray-400">The Verge</span>
      <span class="text-[10px] text-gray-300">all read</span>
    </div>
  </div>
</div>

<h3>Instant switching</h3>
<p>All articles are preloaded into memory at startup. Clicking between feeds is now <strong>instant</strong> — no loading spinners, no flicker. Feeds with more than 25 articles now have a "Load more" button at the bottom.</p>

<h3>Floating mark-read pill</h3>
<p>The old toolbar is gone. A floating pill appears at the bottom of the article list showing "Mark 12 read" — tap it to clear the queue. Disappears when everything is read.</p>

<div class="flex justify-center my-6">
  <div class="rounded-full bg-gray-100 border border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-600 shadow-sm flex items-center gap-1.5">
    <span>✓✓</span> Mark 12 read
  </div>
</div>
`;

const v030RichContent = `
<h2>Your feeds, without the surveillance</h2>
<p>Every time you read an RSS feed, the publisher's tracking infrastructure follows along. Invisible pixels phone home. Links carry your click history in URL parameters. <strong>Not anymore.</strong></p>

<div class="rounded-xl border border-red-200 bg-red-50 p-4 my-6">
  <div class="font-semibold text-sm mb-3">What we strip from every feed:</div>
  <div class="space-y-2">
    <div class="flex items-center gap-3 rounded-lg bg-white border border-red-100 p-2.5">
      <div class="flex items-center justify-center rounded-lg bg-red-100 p-1.5">
        <span class="text-sm">🔍</span>
      </div>
      <div class="flex-1">
        <div class="text-xs font-semibold">Tracking pixels</div>
        <div class="text-[10px] text-gray-500">1×1 invisible images from Facebook, Google Analytics, Quantserve, Feedburner, and others</div>
      </div>
      <span class="text-xs text-red-500 font-semibold line-through">Stripped</span>
    </div>
    <div class="flex items-center gap-3 rounded-lg bg-white border border-red-100 p-2.5">
      <div class="flex items-center justify-center rounded-lg bg-red-100 p-1.5">
        <span class="text-sm">🔗</span>
      </div>
      <div class="flex-1">
        <div class="text-xs font-semibold">URL tracking parameters</div>
        <div class="text-[10px] text-gray-500">utm_source, utm_medium, utm_campaign, fbclid, gclid, and 20+ more</div>
      </div>
      <span class="text-xs text-red-500 font-semibold line-through">Removed</span>
    </div>
    <div class="flex items-center gap-3 rounded-lg bg-white border border-red-100 p-2.5">
      <div class="flex items-center justify-center rounded-lg bg-red-100 p-1.5">
        <span class="text-sm">🛡️</span>
      </div>
      <div class="flex-1">
        <div class="text-xs font-semibold">Ad click identifiers</div>
        <div class="text-[10px] text-gray-500">Microsoft, Snapchat, Twitter, Pinterest click tracking IDs</div>
      </div>
      <span class="text-xs text-red-500 font-semibold line-through">Blocked</span>
    </div>
  </div>
</div>

<h3>Before and after</h3>
<div class="grid gap-3 my-6">
  <div class="rounded-lg border bg-white p-3">
    <div class="text-[10px] font-semibold text-red-500 mb-1">BEFORE</div>
    <code class="text-[10px] text-gray-600 break-all">https://example.com/article?<mark class="bg-red-100 text-red-700">utm_source=rss&amp;utm_medium=feed&amp;utm_campaign=spring&amp;fbclid=abc123</mark></code>
  </div>
  <div class="rounded-lg border bg-white p-3">
    <div class="text-[10px] font-semibold text-green-600 mb-1">AFTER</div>
    <code class="text-[10px] text-gray-600 break-all">https://example.com/article</code>
  </div>
</div>

<h3>Anonymous feed catalog</h3>
<p>When you fetch a feed, the server now records that the feed <em>exists</em> — but never who fetched it. No user IDs, no sessions, no cookies. This catalog powers future features like feed health monitoring, popularity rankings, and AI-powered recommendations — all without knowing who you are.</p>

<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 my-6 text-center">
  <div class="text-sm font-semibold text-emerald-800 mb-1">Privacy invariant</div>
  <div class="text-xs text-emerald-700">The server knows "BBC News exists." It never knows "you read BBC News."</div>
</div>
`;

const v020RichContent = `
<h2>Your reading command center</h2>
<p>FeedZero 0.2 transforms from a simple reader into a full-featured feed discovery and navigation platform.</p>

<div class="rounded-xl border border-indigo-200 bg-indigo-50 p-4 my-6">
  <div class="font-semibold text-sm mb-3">Explore 1,000+ feeds</div>
  <div class="text-xs text-indigo-700 mb-3">Search by topic, country, or paste any URL to add a custom feed.</div>
  <div class="rounded-lg border border-indigo-200 bg-white p-2.5">
    <div class="flex items-center gap-2 mb-2 rounded-md border bg-gray-50 px-2 py-1 text-xs text-gray-400">
      <span>🔍</span> nytimes.com
      <span class="ml-auto text-[10px] text-blue-500">Enter to add</span>
    </div>
    <div class="flex gap-1.5 flex-wrap mb-2">
      <span class="rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[10px]">Tech</span>
      <span class="rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[10px]">Science</span>
      <span class="rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[10px]">World</span>
      <span class="rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[10px]">Culture</span>
    </div>
  </div>
</div>

<h3>Keyboard everything</h3>
<p>Navigate your entire reading workflow without touching the mouse.</p>
<div class="grid grid-cols-2 gap-2 my-6">
  <div class="rounded-lg border bg-white p-2.5 text-center">
    <div class="text-lg font-mono mb-1">j k</div>
    <div class="text-[10px] text-gray-500">Next / Previous</div>
  </div>
  <div class="rounded-lg border bg-white p-2.5 text-center">
    <div class="text-lg font-mono mb-1">h</div>
    <div class="text-[10px] text-gray-500">Full text view</div>
  </div>
  <div class="rounded-lg border bg-white p-2.5 text-center">
    <div class="text-lg font-mono mb-1">o</div>
    <div class="text-[10px] text-gray-500">Open original</div>
  </div>
  <div class="rounded-lg border bg-white p-2.5 text-center">
    <div class="text-lg font-mono mb-1">[ ]</div>
    <div class="text-[10px] text-gray-500">Toggle sidebar</div>
  </div>
</div>

<h3>Cloud sync with zero knowledge</h3>
<p>Sync your feeds across devices using a 4-word passphrase. The server stores an encrypted blob — it can never see your feed list, article history, or reading habits. Even if the server is compromised, your data is safe.</p>

<div class="flex justify-center gap-2 my-6">
  <span class="rounded bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs font-mono">oak</span>
  <span class="rounded bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs font-mono">sun</span>
  <span class="rounded bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs font-mono">fox</span>
  <span class="rounded bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs font-mono">bell</span>
</div>
`;

const v010RichContent = `
<h2>Privacy-first RSS, from the ground up</h2>
<p>FeedZero is a new kind of RSS reader. Everything is encrypted before it leaves your browser. There are no accounts, no analytics, no tracking. Your reading habits are yours alone.</p>

<div class="rounded-xl border border-gray-200 bg-gray-50 p-4 my-6">
  <div class="font-semibold text-sm mb-3">How your data flows</div>
  <div class="space-y-2 text-xs">
    <div class="flex items-center gap-2">
      <span class="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">1</span>
      <span>You add a feed URL</span>
    </div>
    <div class="flex items-center gap-2">
      <span class="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">2</span>
      <span>Content fetched via our CORS proxy (no cookies, no identity)</span>
    </div>
    <div class="flex items-center gap-2">
      <span class="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">3</span>
      <span>Sanitized with DOMPurify (XSS protection)</span>
    </div>
    <div class="flex items-center gap-2">
      <span class="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">4</span>
      <span><strong>Encrypted with AES-GCM-256</strong> before storage</span>
    </div>
    <div class="flex items-center gap-2">
      <span class="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">5</span>
      <span>Stored in IndexedDB — never leaves your browser unencrypted</span>
    </div>
  </div>
</div>

<div class="grid grid-cols-3 gap-2 my-6">
  <div class="rounded-xl border bg-white p-3 text-center">
    <div class="text-2xl mb-1">🔒</div>
    <div class="text-xs font-semibold">AES-256</div>
    <div class="text-[10px] text-gray-500">Everything encrypted at rest</div>
  </div>
  <div class="rounded-xl border bg-white p-3 text-center">
    <div class="text-2xl mb-1">🌙</div>
    <div class="text-xs font-semibold">Dark mode</div>
    <div class="text-[10px] text-gray-500">Easy on the eyes</div>
  </div>
  <div class="rounded-xl border bg-white p-3 text-center">
    <div class="text-2xl mb-1">📖</div>
    <div class="text-xs font-semibold">Full text</div>
    <div class="text-[10px] text-gray-500">Extract full articles</div>
  </div>
</div>

<p>FeedZero exists to protect its users. It is used by journalists, activists, and people living under surveillance. Every decision — architecture, testing, deployment — is made as if a user's safety depends on it.</p>

<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 my-6 text-center">
  <div class="text-sm font-semibold text-amber-800">Open source. Zero telemetry. No accounts required.</div>
  <div class="text-xs text-amber-700 mt-1">Your feeds. Your data. Your business.</div>
</div>
`;

// --- Release data ---

export const releases: ChangelogRelease[] = [
  {
    version: "0.3.1",
    date: "2026-04-06",
    title: "More space to read",
    subtitle: "Reclaimed vertical space, unread badges, instant feed switching, and infinite scroll.",
    items: [
      "Feed source now shown in reader with favicon and name",
      "Removed desktop header bar — full vertical space for content",
      "Unread count badges in the sidebar per feed",
      "Preload all articles at startup — instant feed switching",
      "\"Load more\" button for feeds with 25+ articles",
      "Floating \"Mark N read\" pill replaces toolbar",
      "Favicons auto-refresh weekly, no manual reload needed",
    ],
    richContent: v031RichContent,
  },
  {
    version: "0.3.0",
    date: "2026-04-06",
    title: "Cleaner feeds",
    subtitle: "Tracking pixels, ad click IDs, and UTM parameters stripped automatically. Your feeds, without the surveillance.",
    items: [
      "Tracking pixels stripped from all feed content",
      "UTM parameters and ad click IDs removed from all links",
      "Anonymous feed catalog for future recommendations",
      "Improved changelog with arrow navigation between releases",
    ],
    richContent: v030RichContent,
  },
  {
    version: "0.2.2",
    date: "2026-03-29",
    title: "Bug fixes",
    subtitle: "Small improvements and fixes.",
    items: [
      "Fixed favicon loading for sites with non-standard icon paths",
      "Improved feed refresh reliability",
      "Better error messages when adding invalid URLs",
    ],
  },
  {
    version: "0.2.1",
    date: "2026-03-28",
    title: "Visual polish",
    subtitle: "Warmer palette, smooth transitions, and a refined reading experience.",
    items: [
      "Warm background tint and blue-indigo accents",
      "Smooth hover, select, and sidebar transitions",
      "Refined blockquotes, framed images, editorial typography",
      "Unread/read states with bold titles and accent bars",
      "Softer focus rings and reduced-motion support",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-03-28",
    title: "Find your next read",
    subtitle: "Discover feeds, navigate by keyboard, and keep your reading private.",
    items: [
      "Explore 1,000+ feeds by topic or country",
      "Full keyboard navigation — j/k, Enter, Space, h, o",
      "Unread dots and mark-all-read",
      "Instant feed switching with in-memory cache",
      "Cloud sync with 4-word passphrase",
      "OPML import and export",
    ],
    richContent: v020RichContent,
  },
  {
    version: "0.1.0",
    date: "2026-01-31",
    title: "A private RSS reader",
    subtitle: "Read feeds with end-to-end encryption. No accounts, no tracking.",
    items: [
      "RSS 2.0, Atom 1.0, and JSON Feed support",
      "Zero-knowledge AES-256 encryption",
      "Cloud sync with passphrase",
      "Full-text article extraction",
      "Dark mode",
      "Keyboard navigation",
    ],
    richContent: v010RichContent,
  },
];
