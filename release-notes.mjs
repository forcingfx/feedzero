/**
 * Source of truth for FeedZero release notes.
 *
 * Edit this file when cutting a new release. Then run:
 *   node build-releases.mjs
 * to regenerate releases.xml (the Atom feed) and releases/index.html.
 *
 * The feed is hosted at https://feedzero.app/releases.xml and the app
 * (my.feedzero.app) subscribes to it. Preserve the entry identifiers
 * (`feedzero:release:<version>`) and the feed `<id>` (`feedzero:changelog`):
 * changing them makes every existing subscriber treat old entries as new.
 *
 * Style: plain, factual, README/man-page tone. See
 * ~/.claude/projects/.../memory/feedback_writing_style.md for the full rules.
 * Short rule of thumb: describe what changed, not how exciting it is. No
 * marketing verbs, no emojis, no call-to-action, no em-dashes. Each bullet
 * is one verb-led past-tense sentence ending with a period.
 */

/**
 * Each release:
 *   version   : semver string (must match the app's APP_VERSION when cut)
 *   date      : ISO 8601 date or date-time
 *   title     : short headline (plain, no hype)
 *   subtitle  : one-sentence summary of the release
 *   added / changed / fixed / removed: Keep-a-Changelog sections.
 *     Each is an array of plain strings. Omit empty sections entirely.
 *   affects   : optional array of landing-page feature IDs (the `id:` fields
 *     under `features.items` / `features.minis` in content/home.md) that this
 *     release materially adds or changes. The landing build stamps a NEW
 *     badge on those features when this is the latest release.
 */
export const releases = [
  {
    version: "0.13.0",
    date: "2026-08-02T12:00:00Z",
    title: "Mobile reading rebuilt around gestures",
    subtitle:
      "The reader opens as a layer over the article list, rows swipe to mark read, lists pull to refresh, and mark-all-read can be undone. Reader text size is now adjustable, and expired license tokens explain themselves.",
    affects: ["mobile", "keyboard"],
    added: [
      "Added pull-to-refresh to the article list on mobile. Dragging down from the top refreshes the current view, scoped the same way the refresh control is: a single feed refreshes only that feed, a folder only its members, and an aggregated view every feed.",
      "Added swipe-to-mark-read on mobile. Swiping an article row to the right toggles it between read and unread, with a coloured underlay showing which action will commit.",
      "Added an undo action to mark-all-read. Marking a view read now shows a toast that restores exactly the articles it touched, from both the floating pill and the command palette.",
      "Added a keyboard shortcuts overlay on <code>?</code>. The command palette advertised the shortcut previously without implementing it. The overlay and the list in Settings now render from one source, so they cannot drift apart.",
      "Added a share button to the reader. It opens the system share sheet where the browser provides one and copies the link otherwise.",
      "Added a reader text size preference with small, medium, and large options in Settings, stored in the encrypted vault and synced across devices.",
      "Added Explore and Settings shortcuts to the mobile dock strip, and an upward swipe on the strip now opens the feed drawer.",
      "Added loading skeletons for the article list and for Explore, Signal, Stats, and Settings, which previously rendered blank while loading.",
    ],
    changed: [
      "Rebuilt mobile navigation around the reader as a layer over the article list. Tapping an article opens it, and swiping right or using the back control closes it. The article list stays in place underneath, so returning from an article keeps your scroll position. Swiping the list itself no longer drags the reader in, which frees horizontal swipes for row actions.",
      "Consolidated the mobile header into a single view-options menu holding sort order and the settings entry for the current feed, folder, or filter. Refresh moved to the pull-to-refresh gesture and the drawer, and the refresh status line moved into the drawer beside it, leaving a colour dot in the header.",
      "Made unread counts visible on mobile, where the badges were previously hidden, and added an aggregate unread count to folder rows.",
      "Centred the reader column on wide screens, which previously left text against the left edge with empty space beside it.",
      "Increased interactive controls to a 44 pixel touch target across the mobile interface without changing how they look.",
      "Stopped the mobile dock reordering its feed shortcuts on every tap. Recently viewed feeds still decide which shortcuts appear, but their positions now follow the sidebar order and stay put.",
    ],
    fixed: [
      "Fixed an expired license token reporting raw timestamps on activation. The error now names the expiry date and links to email recovery, and a token rejected for a clock mismatch or a truncated copy says so.",
      "Fixed toasts covering the mobile navigation dock.",
      "Fixed toasts ignoring the selected theme and always rendering dark.",
    ],
  },
  {
    version: "0.12.0",
    date: "2026-05-31T12:00:00Z",
    title: "Paywall false-positive fix and automatic TLS for LAN self-hosts",
    subtitle:
      "Free, fully-readable articles no longer show a false paywall box, and self-hosted deployments on a LAN or bare IP now serve HTTPS without manual certificate setup.",
    added: [
      "Added the running application version to Settings, so the installed build is visible at a glance.",
      "Added Windows PowerShell parity to the self-host script. <code>feedzero.ps1</code> now classifies the host and selects self-signed internal TLS for IP, localhost, and .local deployments, matching the existing shell script.",
    ],
    changed: [
      "Simplified the README and self-hosting guide to a one-command Docker quickstart from the public image, with the longer day-2 and troubleshooting material kept behind it.",
    ],
    fixed: [
      "Fixed free, fully-readable articles being flagged as paywalled. Full-text extraction now treats a substantial extraction as the definitive readable signal and runs paywall heuristics only as a fallback on the extracted teaser, so subscribe prompts in page navigation and footers no longer trigger a false paywall box.",
      "Fixed self-hosted deployments on a LAN or bare IP serving plain HTTP on the HTTPS port, which produced <code>SSL_ERROR_RX_RECORD_TOO_LONG</code>. The server CLI now classifies the host and serves self-signed internal TLS automatically for IP, localhost, and .local hostnames.",
    ],
  },
  {
    version: "0.11.0",
    date: "2026-05-22T12:00:00Z",
    title: "Signal, free cloud sync, per-feed rules, and auto-refresh",
    subtitle:
      "Signal surfaces what is loud across your feeds entirely on-device. Cloud sync is now free for everyone. Per-feed rules act on new articles automatically, feeds refresh in the background, and non-RSS sources work by pasting their URL.",
    affects: ["sync", "starring"],
    added: [
      "Added Signal, an on-device view of what is loud across your feeds. It clusters article titles on proper-noun and compound-noun entities (for example OpenAI or Iran War), ranks topics by how many distinct feeds cover each story rather than how often one outlet repeats it, and folds syndicated coverage of the same story behind a <code>Covered by N outlets</code> badge. Story rows show a peek preview on hover or tap before opening the full reader, and the back button returns to Signal rather than the feed list. It unlocks once the local corpus reaches 100 articles and runs with no external API or LLM. Available on the Personal tier.",
      "Added a per-feed auto-action rules engine. Each rule pairs a condition (the same predicate used by smart filters) with one or more actions applied to new articles during refresh: mark read, star, mute, or move to a folder. Rules are scoped to a single feed and reachable from that feed's settings. Available on the Personal tier.",
      "Added bridges that turn non-RSS source URLs into the native feed each source already publishes. Pasting a Reddit subreddit or user, a GitHub repository, a Mastodon profile, or a YouTube channel URL into Add feed resolves the underlying feed by URL pattern alone, with no scraping. URLs that match no bridge fall back to the existing discovery path. Available on the Personal tier.",
      "Added a per-feed <code>Prefetch full text</code> toggle that extracts the 20 most recent articles on each refresh for offline reading. Feeds you read often (10 or more articles in the past 30 days) prefetch automatically, with the selection computed on-device from the encrypted vault. Available on the Personal tier.",
      "Added periodic background auto-refresh. Feeds refresh every 30 minutes, and a tab that regains focus after sitting idle longer than the interval refreshes immediately.",
      "Added refresh controls to mobile. A refresh button sits in the mobile header and a <code>Refresh all</code> entry in the navigation drawer, both showing a spinning Refreshing state while they run.",
      "Added a quick-switch favicon dock to the closed mobile bottom drawer. The closed strip now shows an All items button and favicons for your most recently viewed feeds; tapping one switches feed without opening the drawer, and the chevron opens the full feed list.",
    ],
    changed: [
      "Made end-to-end encrypted cloud sync a Free-tier feature. Every user can now sync across devices without a license. The Free tier keeps its 50-feed cap, while paid tiers add unlimited feeds, smart filters, auto-organize, and offline prefetch.",
      "Replaced the sidebar dropdown menus with a context-aware cog and a sort control in a sticky header above the article list. The cog opens feed, folder, or smart-filter settings depending on what is selected and hides on aggregated views like All items and Starred. The sort control is an icon-only pill on desktop that expands to its label on hover and stays labeled on mobile.",
      "Tightened license enforcement with daily in-session re-verification. A tab left open now re-checks the subscription every 24 hours, and again when the device wakes from sleep, so a subscription that ends mid-session no longer keeps paid features until the next reload.",
      "Per-feed <code>Refresh now</code> and <code>Clear cached articles</code> actions now disable while running, spin their icon, and confirm with a toast.",
    ],
    fixed: [
      "Fixed duplicate articles appearing when a single feed was refreshed concurrently. Overlapping refreshes of the same feed now share one in-flight request.",
      "Fixed feed favicons that failed to load staying blank. Failed favicons now retry on the next refresh and recover.",
      "Fixed feeds dropping out of an OPML import when their server rate-limited the initial fetch. Rate-limited URLs now import as placeholder feeds and fill in on a later refresh.",
      "Fixed Signal previews rendering empty when an article had no extracted content, which now fall back to the summary, and fixed the preview sheet being clipped by the iOS toolbar.",
    ],
  },
  {
    version: "0.10.0",
    date: "2026-05-19T15:00:00Z",
    title: "Self-host packaged, privacy promise enforced",
    subtitle:
      "Self-host deploys in three commands via Docker. The client stops loading Vercel Speed Insights. Error logs stop emitting feed URLs. The repository ships an explicit AGPL-3.0-or-later LICENSE.",
    added: [
      "Added a single-container Docker deploy with Caddy in front for automatic TLS. <code>cp .env.example .env</code>, edit one value, run <code>./scripts/feedzero up</code>. Day-2 ops (<code>update</code>, <code>backup</code>, <code>restore</code>, <code>logs</code>, <code>doctor</code>) wrap the underlying docker-compose commands so self-hosters do not memorize them.",
      "Added <code>scripts/feedzero</code> (POSIX shell) and <code>scripts/feedzero.ps1</code> (PowerShell) so the same surface works on macOS, Linux, WSL2, Git Bash, and native Windows.",
      "Added a comprehensive self-hosting guide at <code>docs/self-hosting.md</code>. Covers Docker installation on each OS, public-hostname deploys via Let's Encrypt, LAN-only deploys with self-signed certs (with per-OS instructions for trusting Caddy's root CA), day-2 operations, and the seven failures self-hosters actually hit.",
      "Added a GitHub Actions workflow that builds and publishes a multi-arch self-host image (amd64 + arm64) to <code>ghcr.io/forcingfx/feedzero</code> on every version tag. Raspberry Pi self-hosters no longer rebuild from source on updates.",
      "Added integration tests that exercise feed-store and sync-store actions against the real encrypted database via fake-indexeddb. Replaces faith-based mocks at the storage boundary, closing the gap that produced the issue #117 cascade.",
    ],
    changed: [
      "Changed the license from implicit \"All rights reserved\" to <strong>AGPL-3.0-or-later</strong>. The repository now ships a <code>LICENSE</code> file and a matching SPDX identifier in <code>package.json</code>. Section 13 (the network-use clause) means anyone running a modified FeedZero as a public service must offer their users the modified source.",
      "Reduced the first-paint bundle by 90 KB (gzipped). The Defuddle full-text extractor and its adapter registry now load on demand when a user clicks Extracted, not on every page load. Main bundle dropped from 404 KB to 314 KB gzipped — meaningful for the five-year-old phone on a slow connection.",
      "Refactored the feeds route from a 459-line monolith into a layout-with-Outlet shape (ADR 013). The stable two-panel topology survives navigation cleanly and adding a new full-page surface no longer means another <code>isXxxPage</code> flag.",
      "Split the explore catalog from a single 889-line file into a tab-pluggable shell plus per-tab modules. Sets up the upcoming curated catalog work (use-case packs, editorial collections, platform bridges).",
    ],
    fixed: [
      "Server stopped logging full feed URLs in proxy error paths. Previously a failed fetch on <code>/api/feed</code> or <code>/api/icon</code> emitted the target URL into stdout, where it landed in operator-readable log retention. The privacy-floor logger (<code>logError</code>) now handles both call sites with an opaque trace id the user can quote in support.",
    ],
    removed: [
      "Removed the <code>@vercel/speed-insights</code> client SDK. The README's headline privacy promise (“No telemetry. No analytics. No crash reporting. No third-party tracking.”) now matches the shipped code. No page-view or Web-Vitals beacons leave the browser.",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-05-17T12:00:00Z",
    title: "Settings unification, log in for existing license holders, OPML folders",
    subtitle: "The sidebar's settings dropdown collapsed into a single button opening a unified five-tab dialog. License holders can now log in to a fresh device via a two-step wizard. OPML import and export preserve folder organization.",
    added: [
      "Added a Log in wizard for license holders on a fresh device. Settings → Account → Already have a FeedZero account opens a two-step ceremony: paste the license token, then optionally enter the sync passphrase to decrypt cloud data. The wizard surfaces alongside the Subscribe call to action so paying users do not accidentally re-purchase.",
      "Added five Settings tabs (Account, Reading, Help, Import, Export) reachable from a single Settings button in the sidebar that replaces the previous dropdown menu. <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>,</kbd> opens the same dialog.",
      "Added OPML folder preservation. Importing an OPML from Feedly, NetNewsWire, or Inoreader now recreates the parent outline groups as folders and assigns each feed accordingly. Export round-trips the same structure.",
      "Added a Reading tab inside Settings that exposes the article-flood grouping toggle and the Auto-organize launcher.",
      "Added a Help tab inside Settings with inline keyboard shortcuts, a Send feedback button, and a What's new link.",
    ],
    changed: [
      "Consolidated every in-app upgrade button into a single chokepoint. Clicking Upgrade anywhere (sidebar feed-limit notice, Auto-organize gate, feature gates) opens Settings → Account on the Plan card. Stripe Checkout is reachable only from the Plan card's Subscribe buttons, so users always see the tier comparison before committing.",
      "Removed the floating tier pill (Free, Personal, Pro) from the sidebar. It was not clickable and gave a false signal that something there was actionable. The current tier remains visible inside Settings → Account.",
      "Replaced the layered safety controls in Settings → Account with a smaller If-you-lose-access card that shows the support email, an Email-my-license-to-me button, and an Open-recovery-page link. The downloadable plain-text recovery sheet was dropped as redundant with the email-self action.",
      "Widened the desktop sidebar default from 14rem to 18rem so feed titles have room to breathe.",
      "Raised the desktop and mobile breakpoint from 768px to 1024px. The three-panel reading layout is fundamentally a laptop-and-up layout; below 1024px the mobile snap-scroll layout activates cleanly.",
    ],
    fixed: [
      "Fixed the sidebar visibly changing width every time the user navigated between the feeds list, Explore, and Stats. The cause was per-route resizable-panel-group identifiers, which the library persists separately. A single stable identifier across all routes preserves the user-dragged width regardless of navigation.",
      "Fixed the canvas going blank when the browser window was resized between roughly 530 and 767 pixels wide. The desktop layout's panel minimum sizes summed to ~530 pixels but the mobile fallback only kicked in below 768 pixels; the gap left panels clipped by overflow:hidden. Raising the breakpoint to 1024 pixels eliminates the dead zone.",
      "Fixed the sync passphrase reveal overflowing the dialog when the passphrase wrapped long. The container now wraps and scrolls if needed.",
      "Fixed paid users being able to click Delete all data and orphan their Stripe subscription. The Danger Zone now shows Cancel subscription first with a Manage subscription button for paid users; free users see the existing destructive flow.",
    ],
  },
  {
    version: "0.8.2",
    date: "2026-05-15T12:00:00Z",
    title: "Article flood grouping, cloud restore, and sync race fix",
    subtitle: "Flooding feeds no longer drown out everything else in aggregated views, a Restore-from-cloud button recovers from drifted local state, and a cross-device sync race that left Device B with the wrong feed list is fixed.",
    added: [
      "Added inline grouping for same-feed article floods in aggregated views (All items and folder views). Runs of three or more consecutive articles from the same feed within ten-minute pairwise gaps collapse to a summary row with a chevron; expanding inline reveals the full list. Disabled in per-feed views and behind a Settings toggle if undesired.",
      "Added a <code>Restore from cloud</code> button to the Data & Storage dialog. Replaces local feeds and articles with the cloud vault without deleting and recreating the vault, which is the recovery path when a device's local state drifts from what the cloud knows.",
    ],
    fixed: [
      "Fixed a cross-device sync race where a second device could mark its status as synced without the cloud feeds materializing locally. Concurrent pulls now share a single in-flight request and the import is transactional, so the article list never serves a half-imported state.",
      "Fixed the prev/next reader navigation pills appearing on desktop, where they duplicated existing keyboard shortcuts and sidebar navigation. The pills remain on mobile, where the touch surface is needed.",
      "Fixed dialog buttons being pushed off-screen on iOS when the soft keyboard opens. Dialogs are now anchored to the dynamic viewport height so the action row stays reachable regardless of keyboard state.",
    ],
  },
  {
    version: "0.8.1",
    date: "2026-05-14T13:00:00Z",
    title: "Server reliability, observability, and rate limiting",
    subtitle: "Three production bugs fixed across cloud sync, the public stats page, and mobile dialogs. Server-side storage consolidated onto a single backend. Every error response now carries a trace identifier for support.",
    fixed: [
      "Fixed cloud sync vault pulls returning the literal string <code>[object Object]</code> instead of the encrypted payload. The server was storing vaults correctly all along; only the read path was broken. Existing vaults are unaffected and now load correctly.",
      "Fixed cloud sync pushes failing with a 500 error after a deployment-time configuration drift. Sync storage now self-detects the correct backend rather than relying on an exact environment-variable match.",
      "Fixed the public stats page always showing zero feeds tracked. The feed catalog had no persistence layer and reset on every cold start; now backed by persistent storage so counts and the popular-feeds leaderboard populate correctly.",
      "Fixed the mobile soft keyboard covering the bottom of every dialog, which made the cloud-sync passphrase entry unusable. The fix applies to every dialog in the app.",
      "Fixed the mobile bottom navigation drawer being partially hidden behind iOS Safari's browser chrome. The drawer's bottom padding now grows dynamically with the toolbar height.",
    ],
    added: [
      "Added per-client rate limiting on the feed and page proxies. Default 300 requests per minute per client; returns <code>429 Retry-After</code> per RFC 6585 when exceeded.",
      "Added a trace identifier (<code>req_</code> followed by 8 hex characters) to every non-2xx response from the monetization endpoints. Quote it in a support report and the issue can be looked up in the runtime logs.",
      "Added structured single-line JSON logs on every 5xx server error, with an allow-listed field set (route, method, status, trace identifier, error class, error message). No personal data is ever logged.",
      "Added module-load logs in each serverless function that surface which storage backend resolved at cold start. Any future regression where the wrong adapter is chosen becomes visible in the first deploy log.",
      "Added production smoke tests for every server endpoint. Run with <code>SMOKE_TESTS=1 npx vitest run tests/smoke/</code>. The smoke layer is now a required phase of the standard development workflow.",
    ],
    changed: [
      "Consolidated all server-side persistence (license records, vault sync, Stripe event deduplication, the feed catalog, and rate-limit counters) onto a single Upstash KV instance. Replaces a previous mix of Vercel Blob, separate Upstash, and in-memory adapters. Self-hosters not configuring Upstash continue to use the filesystem and memory adapters.",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-05-09T12:00:00Z",
    title: "First-launch reliability fix",
    subtitle: "A latent bug in the new-user initialization path that could leave the app marked as onboarded after a failed first init is fixed.",
    fixed: [
      "Fixed first-launch initialization continuing to mark onboarding complete when the initial database setup failed (for example on browsers without Web Crypto, such as iOS Lockdown Mode). The error is now surfaced and onboarding is not marked complete, so the user is prompted to retry rather than landing in a half-initialized state.",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-05-03T12:00:00Z",
    title: "Mobile bottom drawer, pill navigation, and the stats page",
    subtitle: "A persistent swipeable bottom drawer replaces the offcanvas mobile sidebar, navigation pills handle prev/next on every device, and a public /stats dashboard exposes anonymous usage numbers.",
    added: [
      "Added a persistent swipeable bottom drawer on mobile that replaces the offcanvas sidebar. The drawer handle is always visible at the bottom of the screen and shows the current feed name; tapping or swiping up reveals the full feed list, folders, All items, Explore, and Settings.",
      "Added a bottom sheet feed switcher on mobile. The active feed name in the bottom drawer doubles as a switcher: a tap opens a sheet with all feeds and folders.",
      "Added a public stats page at <code>/stats</code>. Shows total vaults, total feeds tracked, and the top 100 feeds by request volume. No accounts, no personal data, no login.",
      "Added automatic color assignment for new folders. Created folders now get a distinct color from the eight-color palette without an extra picker step.",
      "Added the full settings menu inline in the mobile bottom drawer. Cloud sync, Auto-organize, Keyboard shortcuts, Send feedback, and What's new are all reachable without opening a separate dropdown.",
    ],
    changed: [
      "Replaced the pull-to-advance gesture on mobile with explicit prev/next nav pills. The pills are pinned to the bottom of the reader and remain accessible regardless of scroll position. Pull-to-advance was removed because behavior was inconsistent across mobile browsers.",
      "The mobile nav pills are now icon-only for back navigation, show no keyboard hints, and stretch to fill the available width. Long article titles in the prev/next labels are truncated with ellipses instead of overflowing.",
      "The desktop sidebar and the mobile bottom drawer now share a single navigation body component. Adding a new top-level entry (such as Explore) only needs to be done in one place.",
    ],
    fixed: [
      "Fixed the article list jumping unexpectedly when clicking an already-visible article. The virtualizer no longer re-anchors on click-driven selection changes; keyboard <kbd>j</kbd>/<kbd>k</kbd> still scroll the selected article into view.",
      "Fixed the mobile bottom drawer overflowing horizontally on viewports with safe-area insets. The drawer now respects the iOS Dynamic Island and notch in all orientations.",
      "Fixed desktop reader navigation pills clipping long article titles. The pills now share the available width and grow to fit instead of letting text overflow.",
      "Fixed the folder title toggle in the sidebar collapsing the folder when clicked. Selecting a feed inside a folder on mobile now snaps back to the article list as expected.",
      "Fixed the mobile drawer settings rendering as a nested dropdown that introduced horizontal scroll. The settings entries are now inline within the drawer.",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-05-01T12:00:00Z",
    title: "Resizable panels, navigation pills, and auto-organize",
    subtitle: "Three-panel resizable desktop layout, always-visible prev/next navigation, pull-to-advance on mobile, folder colors, and keyword-based auto-organize.",
    added: [
      "Added a three-panel resizable desktop layout. The sidebar, article list, and reader are now independently draggable columns.",
      "Added prev/next navigation pills pinned to the bottom of the reader panel. The pills are always visible regardless of scroll position and show <kbd>k</kbd>/<kbd>j</kbd> keyboard hints.",
      "Added pull-to-advance gesture on mobile. Scrolling past the end of an article advances to the next; pulling down from the top goes back.",
      "Added folder color customization. An eight-color swatch picker in the folder context menu tints the sidebar label and applies a colored background to folder items.",
      "Added auto-organize. The wand button near New Folder groups existing feeds into topic folders using a built-in keyword ruleset.",
      "Added feed sort mode. Feeds in the sidebar can now be sorted by name, unread count, or kept in the original custom order.",
    ],
    changed: [
      "Article titles in the reader panel are now links to the original URL. The external-link icon in the meta line shows an <kbd>o</kbd> shortcut hint on hover.",
      "The Feed/Full text mode selector is now a compact inline pill control, reducing vertical space. The <kbd>h</kbd> shortcut hint is in a hover tooltip.",
      "The article list is now virtualized. Scrolling through All Items with hundreds of articles no longer causes layout jank.",
      "The desktop breakpoint was lowered from 1024px to 768px so tablet-sized windows use the multi-panel layout.",
      "Publisher boilerplate phrases (\"Read more at\", \"Continue reading\", etc.) are stripped from feed content before display.",
    ],
    fixed: [
      "Fixed article text clipping at the right edge of the reader panel. Replaced Radix ScrollArea (which uses a `display:table` wrapper that breaks text wrapping) with a native `overflow-y-auto` container.",
      "Fixed mobile landing on the reader view when selecting a feed. The app now defaults to the article list, not the reader.",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-04-19T12:00:00Z",
    title: "Feed folders and mobile navigation",
    subtitle: "Organize feeds into collapsible folders, read all items in a folder at once, and swipe between articles on mobile.",
    added: [
      "Added feed folders. Create folders from the sidebar, drag feeds between them, rename or delete folders from the context menu.",
      "Added folder aggregated feeds. Clicking a folder header shows all articles from every feed in that folder, with per-feed title and favicon on each row.",
      "Added swipe navigation on mobile. The article list and reader are side-by-side scroll-snap panels. Swipe left to read, swipe right to go back.",
      "Added a floating back pill on the mobile reader view. Tapping it scrolls back to the article list.",
      "Added safe-area inset support for iPhone Dynamic Island and notch. Content no longer renders under the notch in any orientation.",
      "Added inline feed rename from the three-dot context menu.",
      "Added Vercel Speed Insights for Core Web Vitals monitoring.",
    ],
    changed: [
      "The app now defaults to the All Items view when feeds exist, instead of auto-selecting the first feed.",
      "Unread counts are derived from a single source of truth (`articlesByFeedId`) instead of a separately stored counter. Badges update immediately after adding a feed from the Explore tab.",
      "All articles in a feed render at once. Removed the 25-article display cap and the Load More button.",
      "Sidebar action dots appear only on hover, not after clicking a feed. The fix uses `:focus-visible` so keyboard users still see the dots when tabbing.",
      "Article selection no longer shifts text. The left accent bar reserves its 2px space at all times.",
      "The sidebar was decomposed from a single 728-line component into focused sub-components (FeedItem, FolderItem, SidebarFeedList, confirmation dialogs).",
    ],
    fixed: [
      "Fixed unread badge not updating after adding a feed from the Explore tab.",
      "Fixed sidebar action dots and unread badge overlapping after clicking a feed.",
      "Fixed article text shifting 2px when selected.",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-04-06T18:00:00Z",
    title: "Release notes feed",
    subtitle: "The release notes are now an Atom feed that any RSS reader can subscribe to.",
    added: [
      "Published the release notes as an Atom feed at feedzero.app/releases.xml. New installs auto-subscribe on first launch; existing users can subscribe via Settings → What's new.",
      "Added a \"Clear cached articles\" action to the feed context menu. It deletes the feed's stored articles and re-fetches from source. Read/unread status is lost, and older articles may not reappear if the source no longer publishes them.",
    ],
    changed: [
      "Article content now renders h1–h4 headings with appropriate sizing and spacing. Lists render with markers.",
      "Feeds in the sidebar sort alphabetically, with the release notes feed pinned to the top.",
      "Unread badges use a squircle shape with a subtle background.",
    ],
    removed: [
      "Removed the in-app changelog dialog (~700 lines of custom UI). The Atom feed replaces it.",
    ],
  },
  {
    version: "0.3.1",
    date: "2026-04-06T12:00:00Z",
    title: "More vertical space",
    subtitle: "Removed the desktop header bar. Added per-feed unread counts and in-memory article preloading.",
    added: [
      "Added per-feed unread count badges in the sidebar. The count is derived from the full article set, not just the current page.",
      "Added source attribution in the reader panel. Each article shows the feed's favicon and title under the headline.",
      "Added a \"Load more\" button for feeds with more than 25 articles.",
    ],
    changed: [
      "Removed the 40-pixel desktop header bar. The sidebar toggle moved into the sidebar itself.",
      "Articles preload into memory at startup, so switching feeds no longer shows a loading state.",
      "Replaced the \"mark all read\" toolbar with a floating pill that appears at the bottom only when there are unread articles.",
      "Favicons now refresh on a 7-day cycle. Removed the manual \"Reload favicons\" menu item.",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-04-06T06:00:00Z",
    title: "Tracker and link-param stripping",
    subtitle: "Tracking pixels and URL tracking parameters are removed from feed content before it reaches the browser.",
    added: [
      "Added tracking-pixel stripping. 1×1 images loaded from known tracker domains (Facebook, Google Analytics, Quantserve, Feedburner, and others) are removed from article HTML before render.",
      "Added URL tracking-parameter stripping. `utm_*`, `fbclid`, `gclid`, and around 20 similar parameters are removed from links inside article content.",
      "Added an anonymous feed catalog on the server. It records which feeds exist and how often they are fetched. No user-identifying information is stored.",
    ],
    changed: [
      "The changelog dialog supports arrow-key navigation between releases.",
    ],
  },
  {
    version: "0.2.2",
    date: "2026-03-29",
    title: "Bug fixes",
    subtitle: "Fixes for favicon loading, feed refresh, and error messages.",
    fixed: [
      "Fixed favicon loading for sites that serve icons at non-standard paths.",
      "Improved feed refresh reliability.",
      "Improved error messages when adding an invalid feed URL.",
    ],
  },
  {
    version: "0.2.1",
    date: "2026-03-28",
    title: "Visual polish",
    subtitle: "Palette, transition, and typography adjustments.",
    changed: [
      "Warmed the background tint. Accent color is now blue-indigo.",
      "Added CSS transitions for hover, selection, and sidebar open/close.",
      "Reworked blockquotes, inline images, and editorial typography in article content.",
      "Unread and read article states are now distinguished by bold titles and an accent bar.",
      "Focus rings are softer, and the `prefers-reduced-motion` media query is honored.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-03-28",
    title: "Explore, keyboard nav, sync, and OPML",
    subtitle: "A catalog of around 1,000 feeds, vim-style keyboard shortcuts, end-to-end encrypted sync, and OPML import/export.",
    added: [
      "Added an Explore tab with around 1,000 feeds organized by topic and country. The search box accepts a URL, which is added directly as a feed.",
      "Added vim-style keyboard navigation: `j`/`k` for next/previous article, `Enter` to add a feed, `Space` to scroll, `h` for full text view, `o` to open the original.",
      "Added unread dots and a \"mark all read\" action.",
      "Added optional end-to-end encrypted cloud sync. The encryption key is derived from a four-word passphrase generated from the EFF wordlist. Lost passphrase means lost data, by design.",
      "Added OPML import and export.",
    ],
    changed: [
      "Feed switching now reads from an in-memory cache instead of IndexedDB.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-01-31",
    title: "First release",
    subtitle: "The initial alpha.",
    added: [
      "Added RSS 2.0, Atom 1.0, and JSON Feed parsers.",
      "Added AES-256 encryption of all stored data in IndexedDB.",
      "Added optional cloud sync using a passphrase-derived encryption key.",
      "Added full-text article extraction for feeds that publish only summaries.",
      "Added dark mode.",
      "Added vim-style keyboard navigation.",
    ],
  },
];
