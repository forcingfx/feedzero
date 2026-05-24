#!/usr/bin/env node
/**
 * Capture the nine per-feature landing screenshots referenced in
 * `feedzero-landing` (`claude/landing-page-design-review-*`).
 *
 * Output: docs/marketing/screenshots/feature-*.png (1920×1200 physical,
 * 960×600 CSS @ 2x DPR, ≲250 KB after pngquant).
 *
 * Run: `node scripts/capture-marketing.mjs`
 *  - boots `vite --port 3001 --strictPort` as a child process,
 *  - drives onboarding once (local-only mode),
 *  - seeds neutral demo feeds/articles by dynamic-importing the core
 *    storage modules via Vite's dev server (so each scene paints over a
 *    realistic, but synthetic, reading session),
 *  - walks Playwright through the nine scenes,
 *  - shells out to `pngquant` to keep each PNG under the size budget.
 *
 * Neutral data only — generic publication archetypes, no real user
 * names, no real article URLs. See FEEDS / ARTICLES_BY_FEED below.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(REPO_ROOT, "docs/marketing/screenshots");
const PORT = 3001;
const APP_URL = `http://localhost:${PORT}`;
// The landing site wants 1920×1200 physical pixels per PNG (will be
// downscaled to 960×600 CSS on a HiDPI display). We *capture* at
// 1280×800 CSS × 1.5 DPR so the app's desktop layout renders — the
// sidebar + multi-pane chrome only appears at ≥1024 CSS px.
const CSS_VIEWPORT = { width: 1280, height: 800 };
const DPR = 1.5;

// ── Demo data (neutral; no real publication / person names) ──────────

// Descriptions carry keywords the auto-organize matcher recognises
// (topic-matcher.ts → DEFAULT_TAXONOMY) — "tech", "news", "science",
// "business", "design"/"art" (culture), etc. The matcher scores
// title × 3, description × 2, url × 1, articles × 1; without
// descriptions, many of these neutrally-named feeds wouldn't pass
// MIN_SCORE=2 and the auto-organize result would look mostly empty.
const FEEDS = [
  { slug: "tech-weekly", title: "Tech Weekly", description: "Weekly roundup of technology, software, and developer news." },
  { slug: "dev-notes", title: "Developer Notes", description: "Programming, code, and engineering essays." },
  { slug: "open-source-digest", title: "Open Source Digest", description: "Open source software stories and project highlights." },
  { slug: "homelab-journal", title: "Homelab Journal", description: "Self-hosted servers, linux, and home network engineering." },
  { slug: "release-engineer", title: "The Release Engineer", description: "Notes on software shipping, ci, and devops engineering." },
  { slug: "ml-papers-weekly", title: "ML Papers Weekly", description: "AI and ML research papers, summarised weekly." },
  { slug: "world-affairs", title: "World Affairs Daily", description: "International news and political reporting." },
  { slug: "policy-watch", title: "Policy Watch", description: "Government policy news and political analysis." },
  { slug: "morning-briefing", title: "The Morning Briefing", description: "Daily headlines and breaking news digest." },
  { slug: "city-and-state", title: "City & State", description: "Local news, politics, and city government reporting." },
  { slug: "the-evening-edit", title: "The Evening Edit", description: "Evening news roundup and analysis." },
  { slug: "markets-today", title: "Markets Today", description: "Financial markets, investing, and economic news." },
  { slug: "founders-letter", title: "Founders Letter", description: "Startup business essays from founders." },
  { slug: "indie-trader", title: "The Indie Trader", description: "Independent trader's notes on stocks and markets." },
  { slug: "science-now", title: "Science Now", description: "Scientific research, studies, and discoveries." },
  { slug: "research-roundup", title: "Research Roundup", description: "Academic research highlights across science and medicine." },
  { slug: "design-notes", title: "Design Notes", description: "Essays on art, design, and typography." },
  { slug: "longform-quarterly", title: "Longform Quarterly", description: "Long-form essays on culture, art, and literature." },
  { slug: "field-recordings", title: "Field Recordings", description: "Audio diaries and culture from the field." },
  { slug: "studio-journal", title: "Studio Journal", description: "Notes on art, music, and creative practice." },
];

// One representative article per feed (we want each feed to be "real-looking"
// in the article list; the featured article is the long-form one we click
// into for the reader scenes).
const ARTICLES_BY_FEED = {
  "tech-weekly": [
    { title: "The case for slower software", days: 0, summary: "A reading list on calm interfaces, debounced refreshes, and respecting the user's attention." },
    { title: "What we learned shipping a typed CSS engine", days: 1, summary: "Two years in, the migration trade-offs in plain numbers." },
    { title: "Issue #142 — Distributed systems primer", days: 2, summary: "Seven essays on consensus, gossip, and quorum reads." },
  ],
  "dev-notes": [
    { title: "Notes on writing for review, not for merge", days: 0, summary: "How small commits read better than tidy branches." },
    { title: "A surprising bug in our retry budget", days: 1, summary: "Half-second jitter was the difference between green and red dashboards." },
  ],
  "world-affairs": [
    { title: "What this week's summit actually changes", days: 0, summary: "An explainer on the new framework — and what was left out." },
    { title: "The case for diplomacy that travels", days: 1, summary: "A long view on bilateral talks since the postwar period." },
    { title: "Five charts on global trade in transition", days: 2, summary: "Container traffic, rare-earth flows, and what the data hides." },
  ],
  "policy-watch": [
    { title: "Inside the regulatory backlog", days: 0, summary: "Why agencies are eighteen months behind, and how that compounds." },
    { title: "A short note on housing zoning reform", days: 2, summary: "The cities that moved first are now repealing the loopholes." },
  ],
  "morning-briefing": [
    { title: "Today's headlines in 90 seconds", days: 0, summary: "A digest of overnight wires, market open, and weather watches." },
    { title: "The week ahead", days: 1, summary: "Calendar markers, earnings prints, and one editor's pick." },
  ],
  "markets-today": [
    { title: "What the inflation print really says", days: 0, summary: "A reading of the core monthly change, smoothed and unsmoothed." },
    { title: "Three sectors with falling capex but rising margins", days: 1, summary: "The decoupling that nobody is talking about yet." },
  ],
  "founders-letter": [
    { title: "On hiring your second engineer", days: 1, summary: "The role looks different from your first — and so does the bar." },
    { title: "A short reading list on pricing", days: 3, summary: "Five essays I keep coming back to." },
  ],
  "science-now": [
    { title: "A new look at quantum error correction", days: 0, summary: "The latest result moves the threshold by a factor of three." },
    { title: "Why the rare-earth shortage is also a chemistry story", days: 1, summary: "Refining bottlenecks aren't only geopolitical." },
    { title: "Field notes: a week with the seabird counters", days: 4, summary: "What a long-running biology survey teaches about data hygiene." },
  ],
  "research-roundup": [
    { title: "Best papers from the spring conferences", days: 2, summary: "Ten picks across systems, ML, and HCI." },
  ],
  "design-notes": [
    { title: "Editorial typography for the web, ten years on", days: 0, summary: "What we'd do differently — and what's still right." },
    { title: "The quiet UI revival", days: 1, summary: "On the return of restraint." },
    { title: "Color systems that scale beyond brand", days: 3, summary: "How to escape the ten-thousand-token palette." },
  ],
  "longform-quarterly": [
    { title: "The shape of a long essay", days: 1, summary: "A close read of three pieces that hold attention past 6,000 words." },
  ],
  "field-recordings": [
    { title: "Issue 14: City sounds at dawn", days: 2, summary: "A short audio diary from four neighborhoods." },
  ],
  "homelab-journal": [
    { title: "A 50-watt build for always-on services", days: 0, summary: "Mini-ITX, low-power CPU, and three SATA disks. Annual cost in graphs." },
    { title: "Backups that actually restore", days: 2, summary: "The drill nobody runs — until they have to." },
  ],
  "release-engineer": [
    { title: "Cutting a release on a Friday — calmly", days: 0, summary: "A checklist that survives weekends and on-call rotations." },
    { title: "Test budgets, not test counts", days: 3, summary: "Why your CI bill is the only signal that matters." },
  ],
  "open-source-digest": [
    { title: "Maintainers worth your sponsorship this month", days: 1, summary: "Eight low-noise, high-impact projects." },
  ],
  "ml-papers-weekly": [
    { title: "This week: sparse mixture-of-experts results", days: 0, summary: "Three preprints with replicable benchmarks." },
    { title: "On evaluating long-context models honestly", days: 2, summary: "A short note on needle-in-a-haystack metrics." },
  ],
  "city-and-state": [
    { title: "The transit map nobody voted for", days: 1, summary: "A short history of the latest extension." },
  ],
  "the-evening-edit": [
    { title: "Tonight's read: the long view on grain prices", days: 0, summary: "Two analysts disagree productively." },
  ],
  "indie-trader": [
    { title: "Six trades I closed wrong this quarter", days: 2, summary: "A retrospective on entries, exits, and the journal that called it." },
  ],
  "studio-journal": [
    { title: "What a studio is for", days: 4, summary: "A practitioner's note on rooms that hold work." },
  ],
};

// Article we open in the reader for the full-text scene. Has a rich
// extractedContent so the "Full text" mode renders a real-looking body.
const FEATURED_FEED_SLUG = "design-notes";
const FEATURED_ARTICLE_TITLE = "Editorial typography for the web, ten years on";
const FEATURED_EXTRACTED_HTML = `
<p><em>This is a synthetic article used for product screenshots — no
real outlet, no real author.</em></p>

<p>Ten years ago we shipped the first version of a small CSS file that
became the editorial baseline for a dozen long-form sites. It set a
modest line-height, a serif body, and a handful of measure constraints
keyed off the reader's viewport. It did not do much more than that. We
were not sure it should.</p>

<p>What surprised us was how much of that file still survives in the
projects that adopted it. The viewport math has changed; the variable
fonts arrived; the dark-mode switch went from a designer's foible to a
default. And yet the bones — measure, leading, the rhythm of the
paragraph — have stayed almost exactly the way we drew them on a piece
of grid paper one rainy weekend.</p>

<p>There are a few things we'd do differently. We'd give the reader
real control over the measure — not a five-step slider, but a way to
say "I want this narrower" and have the site honor that across visits.
We'd treat hyphenation as a feature, not a polyfill. And we'd be more
honest about how the choice of body face changes everything else: the
weight of links, the size of headings, the texture of pull quotes.</p>

<p>What's still right is harder to articulate. The page is meant to be
read. The chrome should disappear. The typeface should not call
attention to itself unless the writer has earned it. None of these are
new ideas. They show up in printing manuals from a hundred years ago,
which is also the easiest place to find them.</p>

<p>So this is a note for the next ten years: keep the baseline modest,
let the writer drive, and remember that a page's first job is to make
itself easy to leave alone.</p>
`;

// ── Vite dev server orchestration ────────────────────────────────────

async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok || res.status === 200) return;
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not start within ${timeoutMs}ms`);
}

async function startDevServer() {
  // Refuse to share an external server — we want full control over its
  // lifecycle and a known-clean DB state.
  const taken = await fetch(APP_URL, { method: "HEAD" })
    .then(() => true)
    .catch(() => false);
  if (taken) {
    throw new Error(
      `Port ${PORT} is already in use. Kill the existing process and retry.`,
    );
  }
  console.log(`Starting Vite dev server on :${PORT}…`);
  // Use the binary directly (not via npx) so SIGTERM reaches the actual
  // vite process. `detached: true` puts it in its own process group; we
  // can later SIGTERM the whole group with `-pid` in process.kill.
  const child = spawn(
    resolve(REPO_ROOT, "node_modules/.bin/vite"),
    ["--port", String(PORT), "--strictPort"],
    {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "development" },
      detached: true,
    },
  );
  // Forward only meaningful vite output. The dev-server's structured
  // request log spams the console with 502s for the network-blocked
  // /api/feed proxy (we run sandboxed without WAN access); those are
  // not actionable for screenshot capture.
  const writeFiltered = (stream) => (chunk) => {
    const s = chunk.toString();
    for (const line of s.split("\n")) {
      if (!line) continue;
      if (line.includes('"status":502')) continue;
      if (line.includes('"status":404')) continue;
      stream.write(`[vite] ${line}\n`);
    }
  };
  child.stdout.on("data", writeFiltered(process.stdout));
  child.stderr.on("data", writeFiltered(process.stderr));
  await waitForServer(APP_URL);
  console.log("Dev server ready.");
  return child;
}

// ── Playwright helpers ───────────────────────────────────────────────

async function newContext(browser) {
  return browser.newContext({
    viewport: CSS_VIEWPORT,
    deviceScaleFactor: DPR,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
}

async function completeOnboarding(page) {
  // Fresh installs are silently onboarded by `startNewUserOnboarding`:
  // it generates a passphrase, opens the DB in local-only mode, and
  // marks onboarding-complete — no welcome screen to click through.
  // We just wait for the app shell to appear.
  await page.waitForSelector(
    '[data-sidebar="menu-button"], aside, [role="banner"]',
    { timeout: 30000 },
  );
  await page.waitForTimeout(800);
}

async function seedDemoData(page) {
  // Dynamic-import the live source modules from Vite. Same singleton
  // the app uses — module cache hit, not a fresh DB connection.
  const result = await page.evaluate(
    async ({ feeds, articlesByFeed, featuredFeed, featuredTitle, featuredHtml }) => {
      const db = await import("/src/core/storage/db.ts");
      const schema = await import("/src/core/storage/schema.ts");

      const slugToId = new Map();
      for (const f of feeds) {
        const r = schema.createFeed({
          url: `https://feeds.example.com/${f.slug}.xml`,
          title: f.title,
          siteUrl: `https://example.com/${f.slug}`,
          description: f.description ?? "",
        });
        if (!r.ok) throw new Error(r.error);
        await db.addFeed(r.value);
        slugToId.set(f.slug, r.value.id);
      }

      const now = Date.now();
      const DAY = 24 * 60 * 60 * 1000;
      const articleObjs = [];
      const starred = []; // ids of articles we'll star

      let starCount = 0;
      for (const f of feeds) {
        const list = articlesByFeed[f.slug] ?? [];
        const feedId = slugToId.get(f.slug);
        for (const a of list) {
          const ar = schema.createArticle({
            feedId,
            title: a.title,
            link: `https://example.com/${f.slug}/${a.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`,
            guid: `${f.slug}:${a.title}`,
            summary: a.summary,
            content: `<p>${a.summary}</p>`,
            author: "",
            publishedAt: now - (a.days ?? 0) * DAY - Math.floor(Math.random() * 6 * 60 * 60 * 1000),
          });
          if (!ar.ok) throw new Error(ar.error);
          const obj = ar.value;
          // Mark some as read so the unread badge is meaningful.
          if (Math.random() < 0.55) {
            obj.read = true;
            obj.readAt = now - Math.floor(Math.random() * 3 * DAY);
          }
          // Featured article gets extractedContent for the reader scene.
          if (f.slug === featuredFeed && a.title === featuredTitle) {
            obj.extractedContent = featuredHtml;
            obj.extractedAt = now;
            obj.read = false;
          }
          articleObjs.push(obj);
          // Star a handful spread across feeds for the starred view.
          if (starCount < 6 && Math.random() < 0.35) {
            obj.starred = true;
            obj.starredAt = now - starCount * 2 * 60 * 60 * 1000;
            starred.push(obj.id);
            starCount++;
          }
        }
      }
      // Guarantee at least one star on the featured article (so /feeds/<feature>/articles/<id>
      // can also show the star toggle in the "on" position if needed).
      const feat = articleObjs.find((a) => a.title === featuredTitle);
      if (feat && !feat.starred) {
        feat.starred = true;
        feat.starredAt = now - 60 * 60 * 1000;
      }

      await db.addArticles(articleObjs);
      return { feedCount: feeds.length, articleCount: articleObjs.length };
    },
    {
      feeds: FEEDS,
      articlesByFeed: ARTICLES_BY_FEED,
      featuredFeed: FEATURED_FEED_SLUG,
      featuredTitle: FEATURED_ARTICLE_TITLE,
      featuredHtml: FEATURED_EXTRACTED_HTML,
    },
  );
  console.log(`Seeded ${result.feedCount} feeds, ${result.articleCount} articles.`);
}

async function unlockPersonalTier(page) {
  // Auto-organize and Smart filters are gated behind Personal. The license
  // store accepts a setTier override; honor-system gating means this is
  // exactly what a paying user would see.
  await page.evaluate(async () => {
    const mod = await import("/src/stores/license-store.ts");
    mod.useLicenseStore.getState().setTier("personal");
  });
}

async function gotoAndSettle(page, path) {
  await page.goto(`${APP_URL}${path}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);
}

async function shoot(page, filename, locator) {
  const file = resolve(OUT_DIR, filename);
  if (locator) {
    await locator.screenshot({ path: file });
  } else {
    await page.screenshot({ path: file, fullPage: false });
  }
  console.log(`  → ${filename}`);
  return file;
}

function compressPng(file) {
  if (!existsSync("/usr/bin/pngquant") && !existsSync("/usr/local/bin/pngquant")) {
    console.warn("pngquant not found — skipping compression");
    return;
  }
  try {
    execSync(`pngquant --force --skip-if-larger --quality=70-90 --output "${file}" "${file}"`, { stdio: "pipe" });
  } catch {
    // pngquant exits non-zero if --skip-if-larger triggers — that's fine.
  }
}

// ── Scenes ───────────────────────────────────────────────────────────

async function sceneAnyFeed(page) {
  await gotoAndSettle(page, "/explore");
  const search = page.getByPlaceholder(/Search feeds or paste a URL/i);
  await search.click();
  await search.fill("https://example.com/blog/feed.xml");
  await page.waitForTimeout(200);
  return shoot(page, "feature-any-feed.png");
}

async function sceneDiscover(page) {
  await gotoAndSettle(page, "/explore");
  // Make sure search is cleared so curated categories show.
  const search = page.getByPlaceholder(/Search feeds or paste a URL/i);
  await search.fill("");
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo({ top: 200, behavior: "instant" }));
  await page.waitForTimeout(200);
  return shoot(page, "feature-discover.png");
}

async function sceneKeyboard(page) {
  await gotoAndSettle(page, "/settings?tab=help");
  await page.waitForTimeout(400);
  return shoot(page, "feature-keyboard.png");
}

async function sceneSync(page) {
  await gotoAndSettle(page, "/settings?tab=sync-and-data");
  // Generate a passphrase and open SetupWizard via the store directly so
  // we don't have to click through the chooser dialog.
  await page.evaluate(async () => {
    const gen = await import("/src/core/crypto/passphrase-generator.ts");
    const passphrase = await gen.generatePassphrase();
    // Stash on a window hook so the dialog driver below reads it.
    window.__demoPassphrase = passphrase;
  });
  // Trigger the dialog via the existing UI path: flip the Switch ON.
  const syncToggle = page.getByRole("switch", { name: /toggle cloud sync/i }).first();
  await syncToggle.click();
  // ChooseSyncFlow appears — pick "Set up new cloud sync".
  await page.getByRole("button", { name: /set up new cloud sync/i }).click();
  // SetupWizard with the auto-generated passphrase is now visible.
  await page.waitForSelector("text=Your secret key");
  // Tick "I've saved my secret key" so the Enable button isn't disabled,
  // but DO NOT click Enable — we want the static passphrase + button state.
  const savedCheckbox = page.getByRole("checkbox").first();
  await savedCheckbox.click().catch(() => {});
  await page.waitForTimeout(300);
  return shoot(page, "feature-sync.png");
}

async function sceneSwitchReaders(page) {
  // The Import dialog has no "preview tree before import" affordance —
  // the closest match is the post-import results screen, which carries
  // the OPML `<head>` provenance line ("Imported from X's <title>")
  // and the collapsible list of successfully-imported feeds. That
  // visually delivers "Bring your subscriptions. Folders and all."
  // better than raw OPML XML in the textarea would.
  await gotoAndSettle(page, "/settings?tab=sync-and-data");
  await page.waitForTimeout(500);
  // Synthesise a finished-import state. Driving a real import here
  // would require the network-blocked /api/feed to work; we'd rather
  // paint a deterministic, neutral result.
  await page.evaluate(() => {
    const seed = async () => {
      const mod = await import("/src/stores/import-store.ts");
      const store = mod.useImportStore;
      const FEED_URLS = [
        "https://feeds.example.com/tech-weekly.xml",
        "https://feeds.example.com/dev-notes.xml",
        "https://feeds.example.com/open-source-digest.xml",
        "https://feeds.example.com/world-affairs.xml",
        "https://feeds.example.com/morning-briefing.xml",
        "https://feeds.example.com/policy-watch.xml",
        "https://feeds.example.com/the-evening-edit.xml",
        "https://feeds.example.com/science-now.xml",
        "https://feeds.example.com/ml-papers-weekly.xml",
        "https://feeds.example.com/research-roundup.xml",
        "https://feeds.example.com/design-notes.xml",
        "https://feeds.example.com/longform-quarterly.xml",
        "https://feeds.example.com/markets-today.xml",
        "https://feeds.example.com/founders-letter.xml",
        "https://feeds.example.com/homelab-journal.xml",
        "https://feeds.example.com/release-engineer.xml",
        "https://feeds.example.com/studio-journal.xml",
      ];
      store.setState({
        status: "complete",
        urls: FEED_URLS,
        currentIndex: FEED_URLS.length,
        results: FEED_URLS.map((url) => ({ url, success: true })),
        error: null,
        head: {
          title: "My subscriptions",
          ownerName: "you",
          dateCreated: "2026-04-12",
        },
      });
    };
    return seed();
  });
  await page.waitForTimeout(400);
  // Open the "Successful (N)" collapsible so the feed URLs are visible
  // — closed by default in the component.
  const successHeader = page.getByRole("button", { name: /successful \(/i }).first();
  if (await successHeader.isVisible().catch(() => false)) {
    await successHeader.click();
    await page.waitForTimeout(300);
  }
  // Scroll the import card into view, then capture the whole viewport
  // so the PNG matches the 1920×1200 envelope the landing site expects.
  const importCard = page
    .locator("div", { has: page.locator('> h3:has-text("Import")') })
    .first();
  await importCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  return shoot(page, "feature-switch-readers.png");
}

async function applyAutoOrganize(page) {
  await page.evaluate(async () => {
    const fs = await import("/src/stores/feed-store.ts");
    const tm = await import("/src/core/folders/topic-matcher.ts");
    const am = await import("/src/stores/article-store.ts");
    const feeds = fs.useFeedStore.getState().feeds;
    const articlesByFeedId = am.useArticleStore.getState().articlesByFeedId;
    const matches = tm.matchFeedsToTopics(feeds, articlesByFeedId, tm.DEFAULT_TAXONOMY);
    const grouped = new Map();
    for (const [fid, tid] of matches.entries()) {
      const topic = tm.DEFAULT_TAXONOMY.find((t) => t.id === tid);
      if (!topic) continue;
      if (!grouped.has(topic.name)) grouped.set(topic.name, []);
      grouped.get(topic.name).push(fid);
    }
    const plan = Array.from(grouped.entries()).map(([folderName, feedIds]) => ({ folderName, feedIds }));
    await fs.useFeedStore.getState().applyAutoOrganize(plan);
  });
  await page.waitForTimeout(400);
}

async function sceneStarring(page) {
  // Sidebar with Starred selected + middle pane showing starred articles.
  // After applyAutoOrganize, the sidebar shows color-coded folders too,
  // which is fine — Starred lives above them.
  const starredFeedId = "starred";
  await gotoAndSettle(page, `/feeds/${starredFeedId}`);
  await page.waitForTimeout(500);
  return shoot(page, "feature-starring.png");
}

async function sceneAutoOrganize(page) {
  // Show the *applied* result: the sidebar with color-coded folders.
  // We frame on the whole 960×600 viewport so the folder structure is
  // legible alongside the article list.
  await gotoAndSettle(page, "/feeds/all");
  await page.waitForTimeout(400);
  return shoot(page, "feature-auto-organize.png");
}

async function sceneSmartFilters(page) {
  // Open the smart-filter editor pre-seeded with a 3-condition rule.
  await gotoAndSettle(page, "/feeds/all");
  await page.evaluate(() => {
    const w = window;
    // The store's openEditor accepts a target; passing null = "new filter"
    // and resets fields. We open with null, then set local state by
    // dispatching keystrokes; simpler: hand it a prebuilt target.
  });
  const opened = await page.evaluate(async () => {
    const mod = await import("/src/stores/smart-filter-store.ts");
    const now = Date.now();
    const target = {
      id: "demo-filter-id",
      name: "Recent AI news I haven't read",
      rule: {
        kind: "group",
        match: "all",
        children: [
          { kind: "title", op: "contains", value: "AI" },
          { kind: "publishedAt", op: "in-last-days", value: 7 },
          { kind: "read", op: "is", value: false },
        ],
      },
      createdAt: now,
      updatedAt: now,
    };
    mod.useSmartFilterStore.getState().openEditor(target);
    return true;
  });
  if (!opened) throw new Error("Smart filter editor failed to open");
  await page.waitForSelector('[data-testid="smart-filter-editor-dialog"]');
  await page.waitForTimeout(400);
  return shoot(page, "feature-smart-filters.png");
}

async function sceneFullText(page) {
  // Find the featured article id, then navigate to its deeplink and
  // switch to "Full text" mode.
  const ids = await page.evaluate(async ({ slug, title }) => {
    const fs = await import("/src/stores/feed-store.ts");
    const am = await import("/src/stores/article-store.ts");
    await fs.useFeedStore.getState().reload?.();
    const feeds = fs.useFeedStore.getState().feeds;
    const feed = feeds.find((f) => f.url.includes(slug));
    if (!feed) return null;
    await am.useArticleStore.getState().loadArticles(feed.id);
    const articles = am.useArticleStore.getState().articles;
    const article = articles.find((a) => a.title === title);
    return article ? { feedId: feed.id, articleId: article.id } : null;
  }, { slug: FEATURED_FEED_SLUG, title: FEATURED_ARTICLE_TITLE });
  if (!ids) throw new Error("Featured article not found for full-text scene");
  await gotoAndSettle(page, `/feeds/${ids.feedId}/articles/${ids.articleId}`);
  await page.waitForTimeout(400);
  // Switch to Full text via the pill segmented control.
  await page.getByRole("button", { name: /^full text$/i }).first().click();
  await page.waitForTimeout(800); // let the extracted body render
  return shoot(page, "feature-full-text.png");
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const dev = await startDevServer();

  const browser = await chromium.launch({ headless: true });
  const ctx = await newContext(browser);
  const page = await ctx.newPage();

  page.on("pageerror", (err) => console.warn("[page error]", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.warn("[console]", msg.text());
  });

  // Suppress the noisy "fetching every feed" loop: the dev-server proxy
  // has no WAN access here, so every refresh would mark a feed as errored
  // and the sidebar would fill with red badges. Stub /api/feed with a 304
  // (the publisher-says-nothing-changed happy path) so the seeded feeds
  // stay clean, and stub /api/favicon for the catalog so we don't get the
  // ghost-load spinners either.
  await ctx.route("**/api/feed", (route) =>
    route.fulfill({ status: 304, body: "" }),
  );
  await ctx.route("**/api/favicon*", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );

  try {
    console.log("→ Onboarding (local mode)");
    await page.goto(APP_URL);
    await page.waitForTimeout(500);
    await completeOnboarding(page);
    await unlockPersonalTier(page);
    await seedDemoData(page);
    // Reload so Zustand stores re-hydrate from the freshly-seeded DB.
    await page.reload();
    await page.waitForTimeout(1500);

    const captured = [];

    console.log("→ Scene 1/9: any-feed");
    captured.push(await sceneAnyFeed(page));

    console.log("→ Scene 2/9: discover");
    captured.push(await sceneDiscover(page));

    console.log("→ Scene 3/9: keyboard");
    captured.push(await sceneKeyboard(page));

    console.log("→ Scene 4/9: switch-readers (import)");
    captured.push(await sceneSwitchReaders(page));

    console.log("→ Apply auto-organize (used by scenes 5–7)");
    await applyAutoOrganize(page);
    await page.reload();
    await page.waitForTimeout(1200);
    await unlockPersonalTier(page);

    console.log("→ Scene 5/9: auto-organize result");
    captured.push(await sceneAutoOrganize(page));

    console.log("→ Scene 6/9: starring");
    captured.push(await sceneStarring(page));

    console.log("→ Scene 7/9: smart filters");
    captured.push(await sceneSmartFilters(page));

    console.log("→ Scene 8/9: sync (passphrase dialog)");
    captured.push(await sceneSync(page));

    console.log("→ Scene 9/9: full-text reader");
    // The smart-filter dialog from the previous scene is still mounted on
    // top of /feeds — clear it by routing fresh.
    await page.goto(`${APP_URL}/feeds/all`);
    await page.waitForTimeout(500);
    captured.push(await sceneFullText(page));

    console.log("Compressing with pngquant…");
    for (const f of captured) compressPng(f);

    console.log("\nFinal sizes:");
    for (const f of captured) {
      const s = await stat(f);
      console.log(`  ${(s.size / 1024).toFixed(1).padStart(7)} KB  ${f.replace(REPO_ROOT + "/", "")}`);
    }
  } finally {
    await browser.close();
    try {
      // Detached process — kill the whole group (PID = -pid).
      process.kill(-dev.pid, "SIGTERM");
    } catch {
      try { dev.kill("SIGTERM"); } catch { /* already gone */ }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
