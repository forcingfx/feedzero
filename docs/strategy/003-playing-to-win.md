# 003 — Playing to Win

## Status
Seeded v0 from `README.md` and `CLAUDE.md` Principles. Awaiting first `/research-competitors` run to sharpen against actual competitive data.

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

Measurable success — to be re-baselined per run as data accrues:

- **Adoption among at-risk users.** Vault count from `/api/stats-sync` is the floor (counts encrypted vaults, no PII).
- **Mindshare in privacy communities.** Mentions in EFF / Privacy Guides / r/privacy / Tor Project channels.
- **Survival.** Outlive the next two privacy-positioned competitor shutdowns. (Omnivore + Artifact are the cautionary tales — see `001`.)
- **Recommendation density.** Linked from at least one major privacy-tooling round-up per quarter.

What winning is **not**: maximum DAU, paid conversion, or feature-parity with Feedly's enterprise tier. Those framings would force compromises the aspiration forbids.

## 2. Where to Play

**Segments — primary:**
- Journalists, activists, researchers, lawyers, and source-handlers in adversarial environments.
- Self-hosters who want a real client, not just a server.
- Privacy-paranoid technical pros who already use Signal, Tor, or password managers daily.

**Segments — secondary (acquire opportunistically, don't optimize for):**
- Mainstream privacy-curious users who've heard "Feedly tracks you" and want an alternative.
- RSS power users frustrated by Inoreader / Feedly pricing.

**Segments we are not for:**
- Casual readers who want algorithmic feeds and don't care about telemetry.
- Enterprise team-collaboration use cases.
- Users who want centralized AI summarization at any privacy cost.

**Surfaces:**
- Primary: web app (PWA-capable, works offline, no install friction).
- Secondary: self-hosted Hono server (`server.ts`) for users who want to run their own proxy.
- Not now: native iOS/macOS/Android apps. Reeder + NetNewsWire own that surface; competing there dilutes the privacy story.

**Geographies:** wherever the audience is. English-first; localization follows demand from at-risk communities.

**Channels:**
- Word of mouth in privacy-conscious circles (the only channel that compounds for this audience).
- EFF-adjacent, Privacy Guides, Tor Project mentions.
- Hacker News / r/privacy / r/selfhosted launches.
- Direct evangelism in journalism / activism networks.
- **Not:** paid acquisition, SEO content farms, growth hacking. They contradict the privacy stance.

## 3. How to Win

**The wedge:** FeedZero is the only RSS reader where _the operator cannot read your feed list_, your reading history, or your saved articles — even if subpoenaed, even if the database is dumped, even if the operator is malicious. Everything is encrypted client-side with a key only the user holds. Sync is end-to-end. The server stores opaque blobs.

This isn't a marketing claim — it's the architecture (see `docs/features/008-zero-knowledge-sync.md`, `docs/architecture.md`).

**Why it's durable:**
- **It's hard to copy without rebuilding.** Feedly cannot bolt this on — their whole business model assumes server-side access to your reading data for monetization (ML training, ads, "discovery"). The architecture is the moat.
- **Self-hostable.** Even if FeedZero the project disappears, the user keeps their data and can run the server. Vendor-lock-in is the threat-model FeedZero exists to refuse.
- **Open source.** The privacy claim is auditable. "Trust us" is the failure mode of every shut-down competitor.

**What we explicitly trade away:**
- Server-side ML / personalization / "for you" feeds — they require plaintext access we won't have.
- Cross-user features (popular-in-your-network, social) — incompatible with E2E.
- The fastest possible startup — client-side decryption costs a beat.

These trade-offs are features, not bugs. A competitor offering all three would not be FeedZero.

## 4. Capabilities

What FeedZero must be exceptional at to deliver the wedge above:

| Capability | Why it's required | Current state | Gap |
|------------|-------------------|---------------|-----|
| Client-side cryptography (AES-GCM + PBKDF2 + HMAC) | Foundation of the privacy claim. | Implemented (`src/core/storage/crypto.ts`, `key-material.ts`). | Audit cadence. Recovery UX still rough. |
| Zero-knowledge sync | Required for multi-device without surrendering plaintext. | Implemented (`src/core/sync/`). | Conflict resolution; offline-edit merge. |
| Full-text extraction | Paywalled / cluttered articles must be readable without external services that would see the URL. | Implemented via Defuddle (`src/core/extractor/`). | Adapter coverage. Quality regressions. |
| Feed parsing reliability | If feeds break, the privacy story is irrelevant — users leave. | Implemented via feedsmith (`src/core/parser/`). | Edge-case malformed feeds. |
| Trustworthy CORS proxy | The one server we operate must be minimal and SSRF-safe. | Implemented (`src/core/proxy/`). | Rate limiting, abuse handling. |
| Onboarding that doesn't scare normies | "Generate a 4-word passphrase" must feel safe, not cryptic. | Implemented (`src/components/onboarding/`). | Recovery story still confusing per support load. |
| OPML round-trip | Exit-cost must be zero. Lock-in contradicts the values. | Implemented (`src/core/opml/`). | — |
| Doing AI / summarization without telemetry | Demand exists; ceding it to centralized AI breaks the model. | Not built. | Open question: local LLM? on-device? user-supplied API key? |

The AI / summarization gap is the most important capability decision pending — it's where the market is pulling RSS but where naive implementations would break the privacy claim. The cascade refresh should re-evaluate this row each run as the competitive landscape moves.

## 5. Management Systems

How FeedZero measures and adapts:

- **Vault count.** `/api/stats-sync` — the only legitimate growth metric the privacy architecture allows. No DAU, no funnel, no user IDs.
- **GitHub signal.** Stars, issue volume by category, PR cadence. Issues clustered by `002`'s themes — a spike in any cluster updates the next run's focus.
- **Release cadence.** Tracked via the `new-release` skill. Slowing cadence is a leading indicator of capability rot.
- **This document.** Refreshed via `/research-competitors`. Cadence: weekly while feasible, monthly minimum. Each refresh produces a dated run log in `runs/` — the strategy's audit trail is in git.
- **External review.** Annual security audit (see `docs/audit-2026-03-22.md` for the template). The privacy claim is only as good as the last audit.
- **Failure signals.** Two specific events that should trigger immediate strategy review, not wait for the weekly: (a) a sync incident that exposes plaintext (architectural failure), (b) a competitor shipping audited E2E sync (wedge erosion). Both invalidate sections above and must propagate down the cascade.

## Cascade coherence check

Re-verify each refresh: do sections 2–5 actually follow from section 1? When a section drifts, mark it changed and propagate the change down. The cascade is real only when the layers compose.

Most recent coherence check: _seed only, no live check yet._
