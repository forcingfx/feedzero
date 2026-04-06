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

const v040RichContent = `
<h2>Eating Our Own Dog Food</h2>
<p>You're reading this in FeedZero's own release notes feed. That's new. We deleted the old changelog dialog — 700 lines of custom UI — and replaced it with a real Atom feed at <code>/api/changelog.xml</code>. Any RSS reader can subscribe to it. We subscribe to it ourselves.</p>

<p>The first time you open FeedZero, it automatically adds this feed. If you removed it, you can get it back from Settings → "What's new." It works like any other feed — unread badges, mark as read, the whole thing.</p>

<h3>Clear Cached Articles</h3>
<p>The three-dot menu on every feed now has "Clear cached articles." It does what it says: deletes all stored articles for that feed and re-fetches from the source. Useful when a feed updates its content (like, say, when we rewrite these release notes three times in one day).</p>

<p>There's a confirmation dialog because this is destructive — your read/unread status is gone, and older articles might not come back if the feed no longer publishes them.</p>

<h3>Headings Work Now</h3>
<p>Article content now renders h1–h4 headings with proper sizing and spacing. Lists get markers. It sounds basic — it was. We also fixed it.</p>

<h3>Feeds Are Sorted</h3>
<p>The sidebar used to show feeds in whatever order IndexedDB felt like returning them. Now it's alphabetical, with the release notes feed pinned to the top. Small thing, but it was bothering us.</p>
`;

const v031RichContent = `
<h2>Less Chrome, More Reading</h2>
<p>There was a 40-pixel bar at the top of the screen whose sole purpose in life was to house a sidebar toggle icon. Forty pixels. For one icon. It's gone.</p>

<p>The toolbar above the article list — "12 unread" plus a mark-all-read button — is also gone. In its place, a little floating pill that appears at the bottom only when there's something to mark:</p>

<div class="flex justify-center my-6">
  <div class="rounded-full bg-gray-100 border border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-600 shadow-sm flex items-center gap-1.5">
    <span>✓✓</span> Mark 12 read
  </div>
</div>

<p>Tap it, unread articles go away, pill disappears. That's the whole interaction.</p>

<h3>Source Attribution</h3>
<p>It always bugged me that you'd be reading an article and have no idea which feed it came from. Now the feed's favicon and name sit right under the headline:</p>

<div class="rounded-lg border bg-white p-3 my-6">
  <div class="text-lg font-semibold tracking-tight mb-1">Scientists Find New Signal from Deep Space</div>
  <div class="flex items-center gap-2 text-xs text-gray-500">
    <div class="w-3.5 h-3.5 rounded-sm bg-orange-400"></div>
    <span class="font-medium text-gray-700">Ars Technica</span>
    <span>&bull;</span>
    <span>Apr 6, 2026, 2:30 PM</span>
  </div>
</div>

<p>Small thing. Should have been there from day one.</p>

<h3>Unread Counts</h3>
<p>The sidebar now shows a per-feed unread count. The numbers come from the full article set, not just the first page. When you hover to get the context menu, the badge politely fades out of the way.</p>

<div class="flex-1 rounded-xl border bg-white p-3 my-6">
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

<h3>No More Spinners</h3>
<p>All articles now load into memory at startup. Click a feed and the articles are just <em>there</em>. No spinner, no flash of empty state. For feeds with more than 25 articles, there's a "Load more" button at the bottom.</p>

<p>Also: favicons now refresh themselves on a 7-day cycle. The manual "Reload favicons" menu item is gone because you shouldn't have to think about favicons.</p>
`;

const v030RichContent = `
<h2>The Tracking Problem</h2>
<p>Here's something most people don't realize: RSS feeds are <em>full</em> of tracking junk. Invisible 1×1 pixel images that ping Facebook and Google every time you open an article. Links stuffed with <code>utm_source</code> and <code>fbclid</code> parameters so the publisher can track exactly which link you clicked and where you came from.</p>

<p>RSS was supposed to be the open, decentralized alternative. Instead it became another vector for the same surveillance apparatus that ruined the web. So we decided to do something about it.</p>

<p>Starting with this release, FeedZero strips all of it out before the content reaches your browser:</p>

<div class="space-y-2 my-6">
  <div class="flex items-center gap-3 rounded-lg border p-2.5">
    <span class="text-sm">🔍</span>
    <div class="flex-1">
      <div class="text-xs font-semibold">Tracking pixels</div>
      <div class="text-[10px] text-gray-500">1×1 images from Facebook, Google Analytics, Quantserve, Feedburner, and friends</div>
    </div>
  </div>
  <div class="flex items-center gap-3 rounded-lg border p-2.5">
    <span class="text-sm">🔗</span>
    <div class="flex-1">
      <div class="text-xs font-semibold">URL tracking parameters</div>
      <div class="text-[10px] text-gray-500">utm_source, utm_medium, utm_campaign, fbclid, gclid, and 20+ others</div>
    </div>
  </div>
  <div class="flex items-center gap-3 rounded-lg border p-2.5">
    <span class="text-sm">🛡️</span>
    <div class="flex-1">
      <div class="text-xs font-semibold">Ad click IDs</div>
      <div class="text-[10px] text-gray-500">Microsoft, Snapchat, Twitter, Pinterest click tracking — all of it</div>
    </div>
  </div>
</div>

<p>Here's what a typical link looks like before and after:</p>

<div class="grid gap-3 my-6">
  <div class="rounded-lg border p-3">
    <div class="text-[10px] font-semibold text-red-500 mb-1">BEFORE</div>
    <code class="text-[10px] text-gray-600 break-all">https://example.com/article?<mark class="bg-red-100 text-red-700">utm_source=rss&amp;utm_medium=feed&amp;utm_campaign=spring&amp;fbclid=abc123</mark></code>
  </div>
  <div class="rounded-lg border p-3">
    <div class="text-[10px] font-semibold text-green-600 mb-1">AFTER</div>
    <code class="text-[10px] text-gray-600 break-all">https://example.com/article</code>
  </div>
</div>

<p>You don't have to do anything. It just happens.</p>

<h3>The Feed Catalog</h3>
<p>We also started building something interesting on the server side. When anyone fetches a feed, we now record that the feed <em>exists</em> — but not who fetched it. No user IDs, no sessions, no cookies.</p>

<p>Think of it this way: the server knows "BBC News is a feed that exists and gets fetched a lot." It has absolutely no idea that <em>you</em> read BBC News. That distinction matters, and it's the foundation for everything we want to build next — feed health monitoring, popularity data, maybe recommendations. All without ever knowing who reads what.</p>
`;

const v020RichContent = `
<h2>Now We're Cooking</h2>
<p>Version 0.1 was a proof of concept. You could paste a URL and read articles. Fine. But nobody's going to switch to that from whatever they're already using. Version 0.2 is the one that makes FeedZero a real reader.</p>

<h3>Explore</h3>
<p>We built a catalog of over a thousand feeds, organized by topic and country. Click "Explore" in the sidebar and browse, or just type a URL into the search box — if there's a feed there, we'll find it.</p>

<div class="rounded-lg border p-2.5 my-6">
  <div class="flex items-center gap-2 mb-2 rounded-md border bg-gray-50 px-2 py-1 text-xs text-gray-400">
    <span>🔍</span> nytimes.com
    <span class="ml-auto text-[10px] text-blue-500">Enter to add</span>
  </div>
  <div class="flex gap-1.5 flex-wrap">
    <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px]">Tech</span>
    <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px]">Science</span>
    <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px]">World</span>
    <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px]">Culture</span>
  </div>
</div>

<h3>Keyboard Shortcuts</h3>
<p>The whole point of a desktop reader is that you can fly through articles without reaching for the mouse. So:</p>

<div class="grid grid-cols-2 gap-2 my-6">
  <div class="rounded-lg border p-2.5 text-center">
    <div class="text-lg font-mono mb-1">j k</div>
    <div class="text-[10px] text-gray-500">Next / Previous</div>
  </div>
  <div class="rounded-lg border p-2.5 text-center">
    <div class="text-lg font-mono mb-1">h</div>
    <div class="text-[10px] text-gray-500">Full text view</div>
  </div>
  <div class="rounded-lg border p-2.5 text-center">
    <div class="text-lg font-mono mb-1">o</div>
    <div class="text-[10px] text-gray-500">Open original</div>
  </div>
  <div class="rounded-lg border p-2.5 text-center">
    <div class="text-lg font-mono mb-1">[</div>
    <div class="text-[10px] text-gray-500">Toggle sidebar</div>
  </div>
</div>

<p>Vim-style <code>j</code>/<code>k</code> for article navigation, because if you know you know.</p>

<h3>Cloud Sync</h3>
<p>Here's how sync works: you get a four-word passphrase. That passphrase is used to derive an encryption key. Your feeds and article metadata are encrypted with that key and uploaded as an opaque blob. The server has no idea what's inside.</p>

<div class="flex justify-center gap-2 my-6">
  <span class="rounded bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs font-mono">oak</span>
  <span class="rounded bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs font-mono">sun</span>
  <span class="rounded bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs font-mono">fox</span>
  <span class="rounded bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs font-mono">bell</span>
</div>

<p>Type those four words on another device and your feeds appear. That's it. No account, no email, no password reset flow. If you lose the passphrase, the data is gone — by design.</p>

<p>This release also adds OPML import and export, unread indicators, and mark-all-read.</p>
`;

const v010RichContent = `
<h2>Hello, World</h2>
<p>Google killed Google Reader in 2013. That was over a decade ago. In the time since, RSS didn't die — it just stopped being convenient. Every reader that popped up to fill the void either got acqui-hired into oblivion, pivoted to "AI-powered news curation" (read: tracking), or just quietly started selling your reading habits to advertisers.</p>

<p>FeedZero is the reader I wanted to exist. You paste a URL, you read the articles. That's it. No account. No email. No "Sign in with Google." The whole thing runs in your browser, and everything is encrypted before it touches disk.</p>

<p>Here's the actual data flow:</p>

<div class="rounded-xl border bg-gray-50 p-4 my-6">
  <div class="space-y-2 text-xs">
    <div class="flex items-center gap-2">
      <span class="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold shrink-0">1</span>
      <span>You add a feed URL</span>
    </div>
    <div class="flex items-center gap-2">
      <span class="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold shrink-0">2</span>
      <span>Content fetched through our proxy (publisher sees our server, not you)</span>
    </div>
    <div class="flex items-center gap-2">
      <span class="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold shrink-0">3</span>
      <span>HTML sanitized — no scripts, no XSS, no funny business</span>
    </div>
    <div class="flex items-center gap-2">
      <span class="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold shrink-0">4</span>
      <span>Encrypted with AES-256 right in your browser</span>
    </div>
    <div class="flex items-center gap-2">
      <span class="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold shrink-0">5</span>
      <span>Stored locally in IndexedDB — never leaves your machine unencrypted</span>
    </div>
  </div>
</div>

<p>This first version handles RSS 2.0, Atom, and JSON Feed. There's dark mode, vim-style keyboard navigation, and a full-text extractor for feeds that only ship summaries.</p>

<div class="grid grid-cols-3 gap-2 my-6">
  <div class="rounded-xl border p-3 text-center">
    <div class="text-2xl mb-1">🔒</div>
    <div class="text-xs font-semibold">AES-256</div>
    <div class="text-[10px] text-gray-500">Encrypted at rest</div>
  </div>
  <div class="rounded-xl border p-3 text-center">
    <div class="text-2xl mb-1">🌙</div>
    <div class="text-xs font-semibold">Dark mode</div>
    <div class="text-[10px] text-gray-500">Because of course</div>
  </div>
  <div class="rounded-xl border p-3 text-center">
    <div class="text-2xl mb-1">📖</div>
    <div class="text-xs font-semibold">Full text</div>
    <div class="text-[10px] text-gray-500">Extract the whole article</div>
  </div>
</div>

<p>This is for anyone who wants to read the web without being watched. Journalists, researchers, activists, or just people who remember when the internet wasn't trying to sell them something every three seconds. It's open source, there's no telemetry, and there never will be.</p>
`;

// --- Release data ---

export const releases: ChangelogRelease[] = [
  {
    version: "0.4.0",
    date: "2026-04-06T18:00:00Z",
    title: "Release notes as a feed",
    subtitle: "The changelog is now a real Atom feed. Also: clear cached articles, heading styles, sorted feeds.",
    items: [
      "Changelog is now a real Atom feed at /api/changelog.xml",
      "Auto-subscribes on first launch, manual subscribe via Settings → What's new",
      "\"Clear cached articles\" in feed context menu with confirmation dialog",
      "Headings (h1–h4) and lists styled in article content",
      "Feeds sorted alphabetically with release notes pinned first",
      "Squircle unread badges with subtle background",
    ],
    richContent: v040RichContent,
  },
  {
    version: "0.3.1",
    date: "2026-04-06T12:00:00Z",
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
    date: "2026-04-06T06:00:00Z",
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
