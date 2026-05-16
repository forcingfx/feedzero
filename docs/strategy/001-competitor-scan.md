# 001 — Competitor Scan

## Status
First population — 2026-05-16. <!-- changed 2026-05-16 -->

## Summary

Living table of every RSS reader and adjacent product worth tracking. Sorted by hosting model so the trade-space is visible at a glance: cloud convenience vs. native polish vs. self-hosted control vs. read-later adjacency. The "What FeedZero learns" column is the operative one — every row should produce a feature insight, an anti-pattern to avoid, or a positioning move to mirror or counter.

## Scope

Direct: Feedly, Inoreader, NewsBlur, Feedbin, The Old Reader, BazQux, Feeder, NetNewsWire, Reeder, lire, Fluent Reader, Miniflux, FreshRSS, Tiny Tiny RSS (community fork), CommaFeed, Yarr.

Adjacent: Matter, Readwise Reader, Instapaper, Readless. Omnivore + Artifact + Pocket tracked as shutdown reference points.

## Table

<!-- changed 2026-05-16: first population -->

| Competitor | Hosting | Positioning | Pricing (USD, 2026-05) | Distinctive feature | Privacy posture | Last meaningful release | What FeedZero learns |
|------------|---------|-------------|------------------------|---------------------|-----------------|-------------------------|----------------------|
| **Feedly** | Cloud | Market intelligence + RSS for teams. Consumer side has drifted into upsell theatre. | Free (100 sources) / Pro $6/mo annual / Pro+ $8.25/mo annual (adds Leo AI, 2,500 sources) / Enterprise $1,600+/mo | Leo AI assistant (priorities, mutes, summaries) | Account required. AI summarization sends content to third-party LLM provider. Free tier shows promoted content. | Continuous; Leo AI is the active surface. | The AI-on-Pro+ play is the obvious next demand. We can't match it without crossing our privacy line — make that **the** wedge, not a gap. |
| **Inoreader** | Cloud | Power-user filtering, rules, monitoring. Where Feedly used to be before enterprise pivot. | Free (150 feeds) / Pro $7.50/mo annual or $9.99/mo / Teams + Enterprise on quote | Rules engine + Inoreader Intelligence (article summaries via GPT-4o-mini) | Account required. Public-only article metadata sent to OpenAI per their own docs ("no personal information"). Better disclosure than Feedly. | 2026-03 Intelligence reports automation. | Power-user filtering is sticky. We don't need rules parity — we need rules **with E2E** so even the rules themselves stay private. Anti-pattern: their disclosure is honest but still requires trust. |
| **NewsBlur** | Cloud | Trainable feed intelligence (per-author, per-tag scoring) by solo dev since 2009. | Free (64 sites) / Premium $36/yr / Premium Archive $99/yr / Premium Pro $29/mo | Per-author/tag/title training; blurblogs (social sharing) | Account required. Solo-dev — key-person risk material. Open source (samuelclay/NewsBlur). | Active; AGPL on GitHub. | Solo-dev shipping at this price proves the indie privacy reader is viable. Reminder that competitor exits are slower than they feel. |
| **Feedbin** | Cloud | Clean, opinionated, newsletter + podcast + YouTube + Mastodon in one inbox. | Supporter $2.50/mo / Pro $5/mo / Enterprise $12.50/mo (no free reading tier; 30-day trial) | Newsletter routing via dedicated email address; works with Reeder Classic. | Account required. Indie, no ads. | Active. | Newsletter-via-email is the single feature Pocket refugees most want. Either build it or partner. |
| **The Old Reader** | Cloud | Spiritual Google Reader successor; social. | Free (100 feeds) / Premium $5/mo (500 subs, full-text search, 1yr archive) | Social: follow users, see what friends read. | Account required. Long-tail indie. | Active but slow. | Social-reading died as a category — Artifact's shutdown is the proof. Don't chase. |
| **BazQux** | Cloud | Fast, full-text, indie. | $30/yr or $50/yr or $249 lifetime | Aggressive full-text fetching even from partial feeds | Account required. Indie, single operator. | Active, slow cadence. | Lifetime pricing is a strong signal for the "I'm sick of subscriptions" segment. Worth considering as a vault-only one-time SKU later. |
| **Feeder (Android, nononsenseapps)** | Native / local | Open-source Android RSS, no account, no sync. | Free (Play Store + F-Droid) | True local-only Android client. | Open source, no account, no telemetry per Play listing. | Active. | The closest spiritual sibling on Android. Confirms there's an audience for "no cloud at all." We extend with opt-in E2E cloud. |
| **Feeder.co** | Cloud | Web/extension RSS reader. | Free / Pro / Business (tiers not directly verified — homepage 403) | — | Account required. | Active, regular updates. | _Stale_ for our purposes — name collision with the OSS Android app obscures both. |
| **NetNewsWire** | Native (Apple) | The best free RSS reader for Mac/iOS in 2026. | Free, MIT. | iCloud sync that actually works; native everywhere on Apple. v7.0 with full Liquid Glass support (Jan 2026); 7.0.4 (Apr 2026) added iCloud storage stats + selective sync. | Open source, optional iCloud, optional third-party sync (Feedbin/Feedly/Inoreader). No telemetry. | 2026-04 (7.0.4). | The reference for "privacy-respecting native RSS." Why does someone choose FeedZero over NNW? Answer: cross-platform + zero-knowledge cloud. NNW ties you to Apple + ties your data to iCloud. |
| **Reeder (new)** | Native (Apple) | Unified timeline: RSS + YouTube + Reddit + Mastodon + Bluesky. | Free (10 feeds) / Reeder+ $1/mo or $10/yr (unlimited + shared feeds + social timelines) | Unified timeline; iCloud-only sync. | iCloud only — meaning Apple holds the key, no end-to-end. Account required for shared feeds. | Active (2024+ rewrite). | Reeder's iCloud sync is reported broken in 2026 (drift, slow background sync). Reliability gap we can exploit. |
| **Reeder Classic** | Native (Apple) | Traditional RSS reader, third-party sync. | $4.99 one-time | Works with Feedbin, NewsBlur, FreshRSS, Inoreader, BazQux, FeedHQ, etc. | Same as the backend you pair it with. | Maintained alongside new Reeder. | The "one-time purchase reader that talks to your backend" pattern is a real demand. Could we be that backend for Reeder Classic users? Adds a distribution lever. |
| **lire** | Native (Apple) | Best for offline; auto-fetches full text of every article. | $4.99 one-time | Background full-text fetch for every item; works on a plane. | Local + sync via Feedbin/etc. | Active. | Aggressive full-text fetching matters for offline. We already have extraction — make it batchable + scheduled. |
| **Unread** | Native (Apple) | Gesture-driven minimal reader. | Subscription (pricing not directly verified — App Store gated) | Beautiful single-pane reading. | Local + third-party sync. | Active. | _Stale verification_ — pricing needs direct App Store check next run. |
| **Fluent Reader** | Native (cross-platform) | Local desktop reader, Fluent Design. | Free, open source (BSD-3) | Local-only OR sync to Inoreader/Feedbin/BazQux/Old Reader/Fever/Google Reader API. | Local-first; account optional. | Active. | Electron memory cost (264MB / 7 processes) is the trade. We win on browser-native = no install. |
| **Miniflux** | Self-hosted | Minimalist, opinionated, single Go binary. | Self-host free (AGPL) / hosted at reader.miniflux.app $15/yr | ~50ms render; 20MB RAM idle; strips tracking pixels; proxies media. | Open source, no telemetry, by design. Solo maintainer (Frédéric Guillot). | Active, regular tagged releases. | $15/yr hosted is the floor for the entire RSS-as-a-service market. Anyone above that is paying for trust or polish, not infrastructure. |
| **FreshRSS** | Self-hosted | Community-maintained PHP aggregator, extensible. | Free (AGPL) | Extensions (incl. Pocket-replacement button), themes, multi-DB, multi-user. v1.27 added PHP 8.5, sudo mode, stricter CSP. v1.29 current. | Open source, no telemetry. | 2026 — actively shipping. | The Pocket-button extension shows how the OSS community absorbs shutdowns. Could FeedZero ship a "Pocket export → FeedZero import" path in the next quarter? It's the cheapest acquisition channel we'll ever have. |
| **Tiny Tiny RSS (community fork)** | Self-hosted | Original maintainer Andrew Dolgov retired the project 2025-11-01; long-time contributor supahgreg forked to github.com/tt-rss/tt-rss, GPLv3, ownership of tt-rss.org transferred. | Free | Plugin ecosystem. | Open source. | 2025-11+ active fork. | A live, well-publicised abandonware-to-fork transition. The OSS contingency works only because the code was open. Validates our self-host story; reinforces section 3 wedge. |
| **CommaFeed** | Self-hosted | Google Reader-inspired, Quarkus + React. | Self-host free (Apache-2.0) / commafeed.com free (donation-funded) / PikaPods $1/mo | Free public instance funded by donations — rare survivor model. | Open source, no ads, no tracking. | Active. | Donation-funded public instance is the "purest" privacy story. We can't match without compromising sync infra cost, but worth understanding the audience. |
| **Yarr** | Self-hosted | Single Go binary, embedded SQLite, ~5 deps. | Free | Smallest viable self-host; Vue.js frontend. | Open source. Local only. | Active, low cadence. | Reinforces "minimal beats featured" for self-host. Our self-host story is the Hono server — keep it small. |
| **Readwise Reader** | Cloud (adjacent) | Highlighting + AI Ghostreader + Obsidian/Notion/Roam export. | $9.99/mo annual / $12.99/mo monthly / Lite $5.59/mo (no Reader) | Highlights → PKM workflow; cited AI answers grounded in source text. | Account required. AI usage well-disclosed. | Continuous. | The PKM-export angle is a real moat. We don't need to chase highlighting — but we should make sure OPML + JSON export are loss-free so users can pipe into PKM externally. |
| **Matter** | Cloud (adjacent) | iOS-first read-later with AI Co-Reader. | Free / Premium $60/yr | HD TTS, AI Q&A about articles. | Account required. AI is cloud. | Continuous; absorbed Pocket refugees. | TTS is a feature gap we have. On-device TTS via Web Speech API is cheap to add and stays private. |
| **Instapaper** | Cloud (adjacent) | OG read-later, independent again under Instant Paper, Inc. | Free / Premium $6/mo or $60/yr (first price change in 9 years, 2023) | TTS with 17 AI voices, full-text search, permanent archive. | Account required. Independent + sustainable-business-funded. | Active. | The "independent again, funded by Premium not VC" pitch is exactly the model we want to be seen in. Their public language is good template material. |
| **Readless** | Cloud (adjacent / new) | AI-first RSS + newsletter digest delivered by email. | Pricing not directly verified | GPT-5-class summarizer of feeds → daily digest email. | Account required; ships content through cloud LLM. | 2025 launch, active. | Confirms the AI-first new-entrant wave. They've ceded privacy entirely — that's our opening. |

## Movement since last run

This is the first run.

### New entrants observed
- **Readless** (2025) — AI-first RSS + newsletter digest via email. Aggressively SEO'd.
- **Brief Digest** (2025) — AI-first reader, less established.
- **Reeder (new, 2024+)** — Silvio Rizzi's ground-up rewrite as a unified timeline app. Reeder Classic continues for the traditional crowd.
- **NetNewsWire 7** (2026-01) with Liquid Glass support — the strongest free native Apple option got stronger.

### Notable category shifts
- **Pocket shut down 2025-11-12** (Mozilla); API + apps offline. Data deletion queue active.
- **TT-RSS original abandoned 2025-11-01**; community fork on GitHub picked it up same week.
- **Omnivore shut down 2024-11-15** (team acquihired by ElevenLabs); open-source code remains, community fork at omnivore.work.
- **Artifact shut down 2024-01** (Instagram founders' news aggregator).

Four shutdowns in 19 months across the broader category. The abandonware-risk theme in `002` is not theoretical.

### Price changes since baseline
- N/A (first run). Track from next run.

## Stale / dead products tracked

| Product | Status | Date | Why it matters |
|---------|--------|------|----------------|
| Pocket | Shut down | 2025-11-12 (data deleted; API + apps offline) | Largest read-later shutdown in years. Millions of users redistributed across Matter, Readwise, Instapaper, FreshRSS. The exact migration FeedZero should be on. |
| Tiny Tiny RSS (original) | Retired by maintainer | 2025-11-01 | Live abandonware case. Code being kept alive by community fork — proof OSS contingency works. |
| Omnivore | Shut down | 2024-11-15 (team acquihired by ElevenLabs) | Open-source read-later that died — survivorship lesson. Code remains; community fork exists but slow. |
| Artifact | Shut down | 2024-01 | News aggregator with AI summarization, by Instagram founders — well-funded shutdowns happen too. |

_Run logs in `runs/` capture per-refresh diffs and the reasoning behind table changes._
