# 002 — User Pain Points

## Status
First population — 2026-05-16. <!-- changed 2026-05-16 -->

## Summary

Themed clusters of recurring complaints + feature requests from r/rss, r/RSS_Readers, r/selfhosted (filtered "rss"), the Privacy Guides community, lobste.rs, MacRumors forums, and competitor reviews. Each theme produces a one-sentence implication for FeedZero's roadmap — that's the bridge from "users complain about X" to "we should ship Y."

Quotes are paraphrased to avoid lifting verbatim. Source links preserved for verification.

**Sourcing caveat (2026-05-16):** Reddit and several competitor sites return 403 to `WebFetch` (anti-bot). This run synthesizes from secondary aggregators (Readless, BeeMind, SereneReader, OSSAlt, Zapier, XDA-Developers, lobste.rs, MacRumors, Privacy Guides) plus competitor blogs. Direct r/rss thread scraping is a known gap — see the run log. Future runs should retry via authenticated GitHub/Reddit MCP if available.

## Themes

### Privacy + data ownership <!-- changed 2026-05-16 -->

- Norwegian Consumer Council 2023 audit cited repeatedly: **7 of 8** popular AI news digest services were transmitting unencrypted article content to third-party LLM providers, with no opt-out for data processing. ([source via Alibaba Insights](https://www.alibaba.com/product-insights/how-to-build-a-private-ai-assistant-that-summarizes-news-without-feeding-data-to-corporate-servers.html))
- Feedly's free tier shows "promoted content"; search is locked behind paid plans. The consumer experience has degraded under the enterprise pivot. ([readless](https://www.readless.app/blog/best-rss-readers-2026), [SereneReader](https://serenereader.com/blog/best-rss-readers-2026))
- Inoreader Intelligence transparently sends article title/date/source/author to OpenAI for summarization. Better disclosure than Feedly, but still requires trust in the operator. ([Inoreader blog](https://www.inoreader.com/blog/2025/03/inoreader-intelligence-and-article-summaries-are-here.html))
- Privacy Guides community thread on RSS readers (active discussion, but body 403'd this run): consistent recommendation pattern in the broader web is NetNewsWire (Apple-only), Miniflux (self-host), Feeder/Android (no account). ([thread URL](https://discuss.privacyguides.net/t/rss-reader-recomendation/10989))
- "For privacy and control, self-hosted options like FreshRSS or Miniflux put your data on your own server." — the implicit consensus in self-hosted communities is that there are **no** trustworthy hosted privacy options at scale today. ([readless / selfh.st](https://selfh.st/alternatives/rss-readers/))

**Roadmap implication:** FeedZero is the only entrant that can credibly claim "hosted RSS with end-to-end encryption" — every cloud competitor sees plaintext, every privacy-first option ships only as self-host. That's the wedge; the marketing has to make this concrete (animated threat model, "what your server operator sees", architecture diagram on the landing page).

### Sync friction <!-- changed 2026-05-16 -->

- Reeder (new) iCloud sync reported broken in 2026: "unread counts starting to drift over time," "feeds from the previous day that they had marked as read already," "background sync option was practically not working." ([Jose Munoz Matos blog](https://www.josemunozmatos.com/blog/from-reeder-s-icloud-feeds-to-feedbin-finding-the-perfect-rss-service))
- NetNewsWire 7.0.4 (2026-04) shipped specifically to fix iCloud sync friction: new option to **not** sync unread article content, new iCloud Storage Stats window with a Clean Up button to trim sync DB. ([Michael Tsai](https://mjtsai.com/blog/2026/04/23/netnewswire-7-0-4/), [netnewswire.blog](https://netnewswire.blog/2026/04/03/netnewswire-for-mac-new-icloud.html))
- Users repeatedly switch from iCloud to Feedbin specifically to get reliable cross-device sync. ([MacRumors thread](https://forums.macrumors.com/threads/rss-reader-with-icloud-sync.2225209/))
- Apple-ecosystem sync ties data to Apple's threat model — incompatible with FeedZero's user base (cross-platform + adversarial environments).

**Roadmap implication:** Sync reliability is the loudest live pain in the category right now. FeedZero's zero-knowledge sync (`src/core/sync/`) needs (a) telemetry-free reliability proof — smoke tests catching drift — and (b) marketing that explicitly contrasts with broken iCloud sync without naming names. Conflict resolution and offline-merge are the gaps to close (already flagged in `003` Section 4).

### Mobile UX <!-- changed 2026-05-16 -->

- "Lire is the best Mac RSS reader for offline reading in 2026... fetches the full text of every article in the background, so truncated feeds turn into complete articles you can read on a plane or subway with zero internet." ([readless](https://www.readless.app/blog/best-rss-reader-for-mac-2026))
- Matter is the iPhone winner per multiple aggregators — its draw is gestures and TTS, not features per se. ([readless](https://www.readless.app/blog/best-iphone-rss-reader-apps-2026))
- Native-app reviewers consistently weigh "feels like a native iOS app" above raw features. Web wrappers / PWAs lose this comparison by default.

**Roadmap implication:** FeedZero's PWA needs to feel native on mobile or it loses to NetNewsWire (free, native, iCloud) and Matter (read-later refugees). Three concrete gaps: (1) offline pre-fetch of full text — already have extraction, schedule it; (2) gesture navigation in the reader pane; (3) text-to-speech via Web Speech API (free, on-device, no telemetry).

### AI / summarization <!-- changed 2026-05-16 -->

- The AI-summarization wave is now table stakes in the category: Feedly Leo (Pro+ $8.25/mo, third-party LLM), Inoreader Intelligence (GPT-4o-mini via OpenAI, content sent in clear), Matter AI Co-Reader (Premium $60/yr), Readwise Ghostreader (cited answers, content in cloud), Readless ("GPT-5-class" digest of all feeds by email). ([Feedly](https://blog.feedly.com/leo-and-summarization/), [Inoreader](https://www.inoreader.com/blog/2025/03/inoreader-intelligence-and-article-summaries-are-here.html), [Readless](https://www.readless.app/))
- Privacy-conscious users are explicitly building their own local-LLM setups for this: "AIDailyNews is an intelligent, privacy-focused agent that automatically collects, summarizes, and delivers daily news updates via local AI processing... use Ollama with phi-3:3.8b or llama3:8b." ([passhulk](https://passhulk.com/blog/best-local-llm-privacy-open-source-hosting-guide/), [vchalyi blog](https://www.vchalyi.com/blog/2025/summarize-rss-feed-with-ollama/))
- New AI-first entrants (Readless, Brief Digest) are pure cloud — they ship feed content **and** newsletter content to centralized LLMs. Total privacy give-up for convenience.

**Roadmap implication:** This is the single most important capability decision pending. Ceding AI to centralized providers breaks FeedZero's threat model. Three viable architectures, ordered by feasibility: (1) BYO API key — user supplies their own OpenAI/Anthropic key, FeedZero proxies through the existing CORS proxy with a strict no-log mode; (2) Web LLM (WebGPU on-device inference) — heaviest UX, zero data egress; (3) optional Ollama/local-LLM endpoint with the same `Result<T>` interface. The "BYO API key + local-LLM endpoint" combo is the right v1 — it lets the user pick their own threat model. Flagged in `003` Section 4.

### Full-text extraction <!-- changed 2026-05-16 -->

- Paywall + truncated-feed handling is the recurring extraction complaint. lire wins specifically because it pre-fetches full text aggressively in the background. ([readless](https://www.readless.app/blog/best-rss-reader-for-mac-2026))
- Fluent Reader users explicitly cite "Mercury Parser to pull full-text content for snippet-only feeds" as critical. ([readless](https://www.readless.app/blog/best-rss-reader-for-windows-2026))
- Miniflux strips tracking pixels, blocks referrers, proxies media. That extraction-as-privacy-cleanup angle is rarely marketed but heavily valued by the technical audience. ([Cameron Rye](https://rye.dev/blog/rss-miniflux-2026/))

**Roadmap implication:** FeedZero's extractor (`src/core/extractor/`) is competitive on quality (Defuddle) but not on volume/schedule. Two concrete adds: (a) "extract on background refresh" mode for the user's starred or frequently-read feeds, with a hard quota to avoid abuse; (b) marketing the existing tracking-pixel sanitization as a feature, not a side effect.

### Pricing fatigue <!-- changed 2026-05-16 -->

- BazQux's $249 lifetime is repeatedly recommended in subscription-fatigue threads. ([readless via crunchbase](https://www.crunchbase.com/organization/bazqux), [bazqux FAQ](https://bazqux.com/faq))
- Reeder Classic survives at $4.99 one-time alongside new Reeder's $10/yr subscription — many users explicitly stick with Classic to avoid the recurring fee. ([Spectre Collie blog](https://spectrecollie.com/2025/03/07/i-was-wrong-about-the-new-reeder/))
- Instapaper's 2023 price doubling ($30 → $60/yr) generated friction but they framed it as sustainability — "first price change in 9 years," "operate as a sustainable business funded by Premium subscriptions rather than venture capital runway." ([Instapaper Twitter](https://x.com/instapaper/status/1731704886444605543))
- Feedly's Pro+ at $99/yr for AI features draws repeated "is it worth it" comparison content — signal that the price-feature curve has flattened in users' minds. ([readless](https://www.readless.app/blog/feedly-pro-pricing-vs-readless-2026))

**Roadmap implication:** When FeedZero monetizes, structure as (a) free tier that genuinely works, (b) one-time vault-lifetime pricing for the privacy-paranoid (BazQux model), (c) lightweight annual for sync infra. Don't price-anchor against Feedly Pro+ ($99/yr); the audience that values FeedZero won't pay for AI summarization they can't see.

### Server-died-on-me (abandonware risk) <!-- changed 2026-05-16 -->

This theme escalated from theoretical to acute in the last 19 months:

- **Pocket** (Mozilla, 2017–2025) shut down 2025-11-12. Millions of users displaced. ([Mozilla support](https://support.mozilla.org/en-US/kb/future-of-pocket), [TechCrunch](https://techcrunch.com/2025/05/22/mozilla-is-shutting-down-read-it-later-app-pocket/))
- **Tiny Tiny RSS** original 2025-11-01 retired by maintainer Andrew Dolgov; community fork on GitHub picked up immediately. ([Linux Today](https://www.linuxtoday.com/blog/tt-rss-shuts-down-but-the-project-lives-on-under-a-new-fork/))
- **Omnivore** 2024-11-15 — team acquihired by ElevenLabs, service discontinued, data deleted. Code open-sourced but unmaintained. ([Notes blog](https://notes.ghed.in/posts/2024/omnivore-adquired-elevenlabs/), [TechCrunch](https://techcrunch.com/2024/10/29/elevenlabs-has-hired-the-team-behind-omnivore-a-reader-app/))
- **Artifact** 2024-01 — well-funded news aggregator with AI by Instagram founders. Funded, audienced, dead.
- Existing user defense reactions: "I self-hosted my own RSS reader to keep up with the news" ([XDA](https://www.xda-developers.com/i-self-hosted-my-own-rss-reader-to-keep-up-with-the-news/)), "Self-hosting RSS finally got me off social media for news" ([XDA](https://www.xda-developers.com/this-self-hosted-rss-reader-finally-got-me-off-social-media-for-news/)).

**Roadmap implication:** This is the strongest live tailwind for FeedZero. **Lossless data export must be a first-class promise**, not a tucked-away feature. Three concrete moves: (1) on the landing page, an explicit "exit cost is zero — full OPML + JSON export, encrypted vault format documented, server runs as a single Hono binary you can self-host" panel; (2) a Pocket-import path (URL list ingest exists — verify it handles Pocket's CSV/HTML export format); (3) public commitment language modelled on Instapaper's "sustainable business, not VC runway" — the audience reads operator commitments carefully after the past 19 months.

## Themes not yet observed

When a theme emerges that doesn't fit any of the above, add it here first with 2–5 supporting observations before promoting it to a top-level cluster.

- **Newsletters-in-RSS as a category** — Feedbin's distinguishing move; relevant to Pocket refugees. Watch for this becoming its own theme as Pocket migration patterns clarify.
- **TTS / accessibility** — Instapaper's 17 AI voices, Matter's HD TTS. Currently a feature within "Mobile UX" — may deserve its own bucket if mentions multiply.
