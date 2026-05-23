# 003 — Playing to Win

## Status
Refreshed 2026-05-23 to move **native iOS** from *Defer* to *Build* (see ADR 023). Last full refresh 2026-05-16 against first competitor scan. Markers below show what moved.

<!-- changed 2026-05-16: focus declaration added -->
## Focus

**FeedZero will be great at one thing: fetching feeds reliably and presenting them in a reader that's a pleasure to use.** That is the trunk. Everything else — sync, AI, social, recommendations, team workspaces, market intelligence — is a branch we either prune or grow only when it strengthens the trunk.

Concretely:

- **Build:** anything that makes feed fetching more reliable, more respectful of the publisher, or makes reading faster, calmer, and more legible.
- **Build:** <!-- changed 2026-05-23 --> native iOS app (see ADR 023). The framework-agnostic core (ADR 005) was paid for in advance; Reeder's broken iCloud sync and the Pocket migration window make the App Store presence load-bearing for the journalist segment. macOS and Android remain *defer*.
- **Defer:** AI summarization, advanced filtering rules, social graph features, **native macOS / Android apps**. <!-- changed 2026-05-23: iOS removed from this list --> These are not bad — they just don't compound on the trunk and they trade against the privacy stance.
- **Refuse:** anything that requires server-side access to plaintext (algorithmic feeds, cross-user discovery, server-side ML). These contradict §3 and are not on any roadmap.

When in doubt, the test is: _does this change make FeedZero a better reader of RSS, today, for one person?_ If yes, ship it. If it makes FeedZero a better something-else (a knowledge graph, an AI tool, a team product), it goes on a wishlist, not a sprint.

## Framework

A.G. Lafley + Roger Martin, _Playing to Win_ (2013). Five cascading strategic choices:

1. **Winning Aspiration** — what does winning look like?
2. **Where to Play** — which segments, surfaces, geographies, channels?
3. **How to Win** — the unique value-prop wedge. Differentiation, cost, or focus.
4. **Capabilities** — what must we be exceptional at?
5. **Management Systems** — measurement, cadence, feedback loops.

Each question constrains the next. Inconsistency between layers is the diagnostic — when sections don't compose, the strategy isn't real yet.

Changed sections are marked `<!-- changed YYYY-MM-DD -->` so reviewers can scan diffs without reading every line.

---

## 1. Winning Aspiration

FeedZero wins when **people whose safety depends on private reading habits choose us first** — and when the rest of the privacy-curious market sees us as the reference implementation of "you can have a real cloud-syncing RSS reader without trusting the cloud with your reading list."

The CLAUDE.md principle is operative: _"FeedZero exists to protect its users — journalists, activists, and people living under surveillance. Every decision must be made as if a user's safety depends on it, because it does."_

Measurable success — re-baselined per run as data accrues:

- **Adoption among at-risk users.** Vault count from `/api/stats-sync` is the floor (counts encrypted vaults, no PII).
- **Mindshare in privacy communities.** Mentions in EFF / Privacy Guides / r/privacy / Tor Project channels. <!-- changed 2026-05-16 --> Concrete target: appear on the Privacy Guides community's RSS recommendation thread by end of next quarter.
- **Survival.** <!-- changed 2026-05-16 --> Already operative test, not aspirational: four products in our broader category have shut down in the last 19 months — Pocket (2025-11), TT-RSS-original (2025-11), Omnivore (2024-11), Artifact (2024-01). Surviving this category-wide attrition **is** winning. The privacy moat is also a sustainability moat: no centralized data → no platform liability → cheaper to operate indefinitely.
- **Recommendation density.** Linked from at least one major privacy-tooling round-up per quarter.

What winning is **not**: maximum DAU, paid conversion, or feature-parity with Feedly's enterprise tier. Those framings would force compromises the aspiration forbids.

## 2. Where to Play

<!-- changed 2026-05-16: sharpened segments based on Pocket/Omnivore/TT-RSS migration patterns; added explicit acquisition channels tied to live shutdowns -->

**Segments — primary:**
- Journalists, activists, researchers, lawyers, and source-handlers in adversarial environments. (Unchanged — anchor.)
- Self-hosters who want a real client, not just a server. (Unchanged — `001` shows this audience is large and currently underserved by the native-app side. Reeder Classic + a self-hosted backend is the manual workaround they're using today.)
- **Pocket refugees who already paid for privacy.** ~Millions displaced 2025-11-12. They're sorting between Matter (cloud AI), Readwise Reader (cloud + PKM), Instapaper (cloud independent), and self-hosted Wallabag/FreshRSS extensions. The privacy-conscious subset is currently underserved — Matter ships content to the cloud, Wallabag requires self-hosting.
- **TT-RSS users whose admin walked away.** Smaller cohort but high-value: they already trust E2E principles and run their own infra. They're a natural early-adopter pool for our self-hosted Hono server.

**Segments — secondary (acquire opportunistically, don't optimize for):**
- Mainstream privacy-curious users who've heard "Feedly tracks you" and want an alternative.
- RSS power users frustrated by Inoreader/Feedly pricing escalation ($99/yr for Feedly Pro+ AI is the flashpoint cited in pricing-fatigue threads).
- Feedbin / NetNewsWire users who want cross-platform sync without iCloud lock-in.

**Segments we are not for:**
- Casual readers who want algorithmic feeds and don't care about telemetry.
- Enterprise team-collaboration use cases (Feedly's $1,600+/mo segment).
- Users who want centralized AI summarization at any privacy cost (Readless, Brief Digest's audience).
- Apple-ecosystem-only users where NetNewsWire 7 already solves the problem for free. They are NNW's; chasing them is a losing fight.

**Surfaces:** <!-- changed 2026-05-23: iOS promoted to a shipping surface; macOS/Android remain deferred -->
- Primary: web app (PWA-capable, works offline, no install friction).
- Primary, shipping: **native iOS app** (React Native, App Store; in build per ADR 023). The "Reeder + NNW own that surface" premise has weakened — Reeder's iCloud sync is broken in 2026 and the Pocket migration window favors a native option with the App Store as a trust signal. The privacy wedge (§3) survives the move because `src/core/` is framework-agnostic (ADR 005) and the sync vault remains zero-knowledge regardless of client.
- Secondary: self-hosted Hono server (`server.ts`) for users who want to run their own proxy.
- Not now: native macOS / Android apps. React Native makes Android cheaper later; macOS via Mac Catalyst is a near-free byproduct of an iPad layout. Neither is in scope yet. **Distribution lever still on the table:** Reeder Classic supports the Fever / Google Reader API, and our self-hosted server could expose one — a way to reach Reeder users without building for every Apple form factor.

**Geographies:** wherever the audience is. English-first; localization follows demand from at-risk communities.

**Channels:** <!-- changed 2026-05-16 -->
- Word of mouth in privacy-conscious circles (still the only channel that compounds for this audience).
- **Explicit migration paths from shutdowns**: Pocket → FeedZero importer (Pocket exported HTML, parser at `src/core/opml/pocket-parser.ts` as of 2026-05-18); TT-RSS → OPML import path (already supported); Omnivore → JSON import (TODO). Each ships with a landing page that ranks for the shutdown event — copy drafted in [`docs/marketing/`](../marketing/), deployment tracked in [`docs/marketing/TODO.md`](../marketing/TODO.md). This is the highest-leverage acquisition opportunity in the category right now.
- EFF-adjacent, Privacy Guides, Tor Project mentions.
- Hacker News / r/privacy / r/selfhosted launches.
- Self-hosted communities (selfh.st, awesome-selfhosted) — listing visibility.
- Direct evangelism in journalism / activism networks.
- **Not:** paid acquisition, SEO content farms, growth hacking. They contradict the privacy stance.

## 3. How to Win

<!-- changed 2026-05-16: anchored the wedge in measurable terms (Norwegian Consumer Council finding) and named the competitive failure mode -->

**The wedge:** FeedZero is the only RSS reader where _the operator cannot read your feed list_, your reading history, or your saved articles — even if subpoenaed, even if the database is dumped, even if the operator is malicious. Everything is encrypted client-side with a key only the user holds. Sync is end-to-end. The server stores opaque blobs.

This isn't a marketing claim — it's the architecture (see `docs/features/008-zero-knowledge-sync.md`, `docs/architecture.md`).

**The market context that makes the wedge sharp** (from this run): A 2023 Norwegian Consumer Council audit found that **7 of 8** popular AI-news-digest services transmit unencrypted article content to third-party LLM providers, with no opt-out. The 2026 landscape has gotten worse, not better: Feedly Leo, Inoreader Intelligence (GPT-4o-mini), Matter AI Co-Reader, Readwise Ghostreader, and the AI-first new entrants (Readless, Brief Digest) all funnel reading content to centralized LLMs. Inoreader's transparency is admirable, but transparency isn't the same as architectural impossibility. **FeedZero is the only product in `001` that makes data exposure architecturally impossible, not just policy-impossible.**

**Why it's durable:**
- **It's hard to copy without rebuilding.** Feedly cannot bolt this on — their whole business model assumes server-side access to your reading data for monetization (ML training, ads, "discovery"). Their AI Pro+ tier is the bet against E2E. The architecture is the moat.
- **Self-hostable.** Even if FeedZero the project disappears, the user keeps their data and can run the server. Vendor-lock-in is the threat-model FeedZero exists to refuse. <!-- changed 2026-05-16 --> The 19-month run of category shutdowns (Pocket, TT-RSS, Omnivore, Artifact) makes this concrete, not abstract: every shutdown is FeedZero's marketing campaign. Survivors who get this right inherit the audience.
- **Open source.** The privacy claim is auditable. "Trust us" is the failure mode of every shut-down competitor.

**What we explicitly trade away:**
- Server-side ML / personalization / "for you" feeds — they require plaintext access we won't have.
- Cross-user features (popular-in-your-network, social) — incompatible with E2E. Artifact's shutdown validates the bet against this category.
- The fastest possible startup — client-side decryption costs a beat.

These trade-offs are features, not bugs. A competitor offering all three would not be FeedZero.

## 4. Capabilities

<!-- changed 2026-05-16: sharpened AI/summarization gap with concrete architecture choices; added sync-reliability and Pocket-import as new gap rows -->

What FeedZero must be exceptional at to deliver the wedge above:

| Capability | Why it's required | Current state | Gap |
|------------|-------------------|---------------|-----|
| Client-side cryptography (AES-GCM + PBKDF2 + HMAC) | Foundation of the privacy claim. | Implemented (`src/core/storage/crypto.ts`, `key-material.ts`). | Audit cadence. Recovery UX still rough. |
| Zero-knowledge sync | Required for multi-device without surrendering plaintext. | Implemented (`src/core/sync/`). | **Reliability proof.** Reeder's iCloud sync is reported broken in 2026 — drift on unread counts, slow background sync. NetNewsWire 7.0.4 shipped specifically to fix this for free users. FeedZero needs smoke tests catching drift, plus offline-edit merge. Conflict resolution remains the open spec. |
| Full-text extraction | Paywalled / cluttered articles must be readable without external services that would see the URL. | Implemented via Defuddle (`src/core/extractor/`). | **Background pre-fetch** for starred / frequently-read feeds (lire's distinctive feature; rated #1 for offline). Adapter coverage. Quality regressions. Market existing tracking-pixel sanitization. |
| Feed parsing reliability | If feeds break, the privacy story is irrelevant — users leave. | Implemented via feedsmith (`src/core/parser/`). | Edge-case malformed feeds. |
| Trustworthy CORS proxy | The one server we operate must be minimal and SSRF-safe. | Implemented (`src/core/proxy/`). | Rate limiting, abuse handling. |
| Onboarding that doesn't scare normies | "Generate a 4-word passphrase" must feel safe, not cryptic. | Implemented (`src/components/onboarding/`). | Recovery story still confusing per support load. |
| OPML round-trip | Exit-cost must be zero. Lock-in contradicts the values. | Implemented (`src/core/opml/`). | — |
| **Pocket / Omnivore / TT-RSS import paths** | Highest-leverage acquisition channel right now per §2. URL-list ingest already exists. | Partial (URL-list ingester in `src/core/opml/url-list-parser.ts`). | Verify it handles Pocket's exact HTML/CSV export format; verify Omnivore's JSON ingest. Add a landing-page panel per shutdown event. |
| **AI / summarization without telemetry** | Demand exists; ceding it to centralized AI breaks the model. Inoreader Intelligence + Feedly Leo are the threat to the wedge. | Not built. | **Architecture choice — this is the most important capability decision pending.** Three options, ranked by feasibility: (1) **BYO API key** — user supplies their own OpenAI/Anthropic key, FeedZero proxies through the existing CORS proxy with strict no-log mode. Lowest engineering cost, lets the user own their threat model. (2) **WebGPU local LLM** via Web LLM / Transformers.js — zero data egress but heavy on UX (model download, slow on phones). (3) **Optional Ollama endpoint** with same `Result<T>` interface — for self-hosters who already run a local LLM. Recommended v1: ship (1) first, document (3) as a config option, revisit (2) when WebGPU is more universal. |
| Sync UX without lock-in | Apple's iCloud ties to Apple threat model; Feedly account ties to Feedly. We must offer real cross-platform sync without ecosystem capture. | Implemented (vault sync, vendor-neutral). | Document the self-host path more prominently. |
| **TTS / accessibility** | Matter + Instapaper both ship as differentiating features. | Not built. | Web Speech API gives free, on-device TTS in 1–2 days of work. Low cost, real value, fully aligned with privacy. |

The AI / summarization gap is the most strategically important row — it's where the market is pulling RSS but where naive implementations would break the privacy claim. <!-- changed 2026-05-16 --> The decision now has a concrete proposal (BYO API key + Ollama endpoint); the next run should reflect progress or refute the proposal.

## 5. Management Systems

<!-- changed 2026-05-16: added category-shutdown event as immediate-review trigger; clarified strategy-doc cadence -->

How FeedZero measures and adapts:

- **Vault count.** `/api/stats-sync` — the only legitimate growth metric the privacy architecture allows. No DAU, no funnel, no user IDs.
- **GitHub signal.** Stars, issue volume by category, PR cadence. Issues clustered by `002`'s themes — a spike in any cluster updates the next run's focus.
- **Release cadence.** Tracked via the `new-release` skill. Slowing cadence is a leading indicator of capability rot.
- **This document.** Refreshed via `/research-competitors`. Cadence: weekly while feasible, monthly minimum. Each refresh produces a dated run log in `runs/` — the strategy's audit trail is in git. <!-- changed 2026-05-16 --> Plus: any competitor shutdown event (`001`'s "stale/dead" table grows by a row) triggers an out-of-cycle refresh of §2 and §3 within 48 hours — the migration acquisition window is short.
- **External review.** Annual security audit (see `docs/reports/audit-2026-03-22.md` for the template). The privacy claim is only as good as the last audit.
- **Failure signals.** Three specific events that should trigger immediate strategy review, not wait for the weekly: (a) a sync incident that exposes plaintext (architectural failure), (b) a competitor shipping audited E2E sync (wedge erosion), (c) <!-- changed 2026-05-16 --> a major shutdown adding a row to `001`'s stale/dead table — section 2's "Where to Play" should re-rank migration channels. All three invalidate sections above and must propagate down the cascade.

## Cascade coherence check

Re-verify each refresh: do sections 2–5 actually follow from section 1? When a section drifts, mark it changed and propagate the change down. The cascade is real only when the layers compose.

<!-- changed 2026-05-16 -->
**2026-05-16 coherence check:** §1 (winning aspiration: protect at-risk users) → §2 (segments centered on adversarial-environment users + privacy-conscious migrants from shutdowns) → §3 (E2E architecture as both moat and sustainability story, sharpened against the Norwegian audit finding) → §4 (capabilities concentrated on crypto, sync reliability, AI-without-telemetry, lossless migration) → §5 (measurement aligned with no-telemetry constraint; shutdown-event trigger added). **Cascade composes.** The one tension to flag: §3 ("the operator cannot read your data") + §4's AI proposal ("BYO API key proxied through our server") — the proxy must be **provably** no-log for the proposal to be coherent. That's an architecture work item for the run that implements (1), not a contradiction in the strategy.

<!-- changed 2026-05-23 -->
**2026-05-23 partial coherence check (iOS surface promotion, ADR 023):** §1 unchanged — App Store presence strengthens the "protect at-risk users" aspiration by adding Apple's identity / signing / review work as a third-party trust signal for the journalist segment. §2 surfaces updated to make iOS a shipping primary surface; §3 wedge unchanged because the sync vault remains zero-knowledge regardless of client (`src/core/` is framework-agnostic per ADR 005, and the SQLite-backed iOS storage uses the same AES-GCM ciphertext + HMAC index columns as the web Dexie store). §4 capabilities row for "Sync UX without lock-in" is materially strengthened: iOS users no longer have to choose between FeedZero and a native client. §5 measurement is unchanged in shape but gains an App Review event class — a rejection or a 7-day review lag is a release-cadence failure signal worth reviewing. **Cascade composes.** New tension to track: Apple IAP takes 15–30%, so the "survival" success measure in §1 now has a per-channel cost asymmetry — iOS-acquired paid users contribute less per subscription than web-acquired ones. Not a contradiction; a metric to watch.
