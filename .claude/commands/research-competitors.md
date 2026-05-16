---
description: Scan the RSS reader landscape and refresh FeedZero's Playing-to-Win strategy in docs/strategy/.
argument-hint: "[focus] — optional. A competitor name (e.g. readwise-reader) or theme (e.g. pricing) to deep-dive instead of running the full scan."
---

# /research-competitors

You are running FeedZero's competitor + strategy refresh. Output goes to `docs/strategy/`. **Do not touch `src/`, `tests/`, or any other tree.** Match the voice of `docs/features/` (prose headings, tables, opinionated).

Focus argument (optional): `$ARGUMENTS`

- If empty → full landscape scan (default).
- If a competitor slug (e.g. `feedly`, `readwise-reader`) → deep-dive on that one competitor only. Update the relevant row in `001-competitor-scan.md`, append observations to the latest run log, do **not** rewrite `002` or `003`.
- If a theme (e.g. `pricing`, `ai-summarization`, `self-hosting`) → scan all competitors through that lens, update relevant sections of `002` and `003`, leave the rest alone.

## Step 1 — Read prior state

Before scanning anything external:

1. `ls docs/strategy/runs/` — find the most recent dated run log. Read it.
2. Read `docs/strategy/001-competitor-scan.md`, `002-user-pain-points.md`, `003-playing-to-win.md`. The new run **revises** these, marking changed sections with `<!-- changed YYYY-MM-DD -->`. It does not replace them.
3. Read `README.md`, `package.json` version, and `CLAUDE.md`'s **Principles** section. These anchor the "Winning Aspiration" — do not invent a new one.

## Step 2 — Scan

Use `WebFetch` + `WebSearch`. Sources, in order:

### Direct competitors (cloud)
Feedly, Inoreader, NewsBlur, Feedbin, The Old Reader, BazQux, Feeder, Readwise Reader (RSS surface).

### Direct competitors (native / local-first)
NetNewsWire (macOS/iOS), Reeder 5, lire, ReadKit, Unread, Fluent Reader.

### Self-hosted
Miniflux, FreshRSS, Tiny Tiny RSS, CommaFeed, Stringer, FreshRSS, Yarr.

### Adjacent (read-later / aggregators)
Pocket, Matter, Readwise Reader (broader), Instapaper. Note Omnivore + Artifact as shutdown reference points — survivorship in this category matters.

### Community signal
- `reddit.com/r/rss` — top + hot posts last 90 days. Cluster complaints.
- `reddit.com/r/RSS_Readers` — same.
- `reddit.com/r/selfhosted` filtered for "rss" — self-hoster pain.

### New entrants
- `alternativeto.net/category/internet/rss/` — new arrivals.
- Product Hunt search "RSS" — last 90 days.

### For each competitor, capture
| Field | Notes |
|------|------|
| Positioning headline | Their own words, from homepage hero. |
| Pricing | Free tier limits + paid tiers in USD. |
| Distinctive feature | What they're known for that others don't have. |
| Hosting model | Cloud / native / self-hosted / hybrid. |
| Last meaningful release | Date + what shipped. Stale projects are signal. |
| Privacy posture | Telemetry? Account required? Encrypted at rest? Open source? |
| What FeedZero learns | One sentence — feature, anti-pattern, or positioning insight. |

Pricing changes monthly — always verify against the live page, never quote from prior run logs.

## Step 3 — Synthesize

### Update `001-competitor-scan.md`
One sorted table (by hosting model: cloud → native → self-hosted → adjacent). Below it, a "Movement since last run" subsection listing diffs (new entrants, dead products, price changes, notable releases). If a competitor is gone or stale >12 months, mark `_stale_` rather than removing — survivorship data is itself a signal.

### Update `002-user-pain-points.md`
Cluster complaints by theme. Existing buckets to extend, not replace:
- **Privacy + data ownership** — telemetry, accounts, where my reading lives.
- **Sync friction** — losing reads across devices, conflicts, paywalled sync.
- **Mobile UX** — what mobile readers do badly.
- **AI / summarization** — demand for it, fear of telemetry from it.
- **Full-text extraction** — paywalled article handling, parser quality.
- **Pricing fatigue** — subscription resentment, lifetime-license demand.
- **Server-died-on-me** — abandonware risk, "where's my OPML?" exits.

Each theme: 2–5 representative quotes (paraphrased, with source link), then one sentence on **what this means for FeedZero's roadmap**.

### Update `003-playing-to-win.md`
Lafley + Martin's 5 cascading questions. Revise, mark changes with `<!-- changed YYYY-MM-DD -->`. Each section must be **opinionated and falsifiable**, not a generic mission statement. If a section can't be sharpened with this run's data, leave it and note that in the run log.

1. **Winning Aspiration** — what does winning look like for FeedZero? Anchor on CLAUDE.md Principles ("FeedZero protects people"). Measurable success criteria.
2. **Where to Play** — segments (privacy-paranoid pros? journalists/activists per CLAUDE.md? self-hosters? mainstream privacy-curious?), surfaces (web/PWA/native/extension), geographies, acquisition channels. Be explicit about who we are **not** for.
3. **How to Win** — the wedge. The "crushing" part. What can FeedZero do that no incumbent can or will? Why is that durable? Why won't Feedly copy it in a quarter?
4. **Capabilities** — what must FeedZero be exceptional at to win this way? (E2E crypto, full-text extraction, sync UX without lock-in, AI without telemetry, OPML round-trip, etc.) For each: are we there? gap to close?
5. **Management Systems** — measurement, cadence, feedback loops. Vault count from `/api/stats-sync`, GitHub stars, release cadence (the `new-release` skill), issue volume by category, this very strategy doc's refresh cadence.

## Step 4 — Persist the run log

Write `docs/strategy/runs/YYYY-MM-DD.md` (UTC date). Structure:

```
# Run YYYY-MM-DD

## Focus
Full landscape | <competitor> | <theme>

## Sources scanned
- competitor URLs hit
- subreddit threads referenced
- new entrants discovered

## Key new findings
- bulleted, terse

## Cascade changes
One paragraph: what moved in 003-playing-to-win.md and why.

## Open questions
Things to chase next run.
```

## Step 5 — Self-check before finishing

- `git status` shows only `docs/strategy/**` modified. If anything else is touched, revert it.
- Spot-check 3 competitor pricing pages directly — do not trust your synthesis blindly. Hallucinated pricing is the #1 failure mode.
- The cascade in `003` reads as something FeedZero would actually do, not a generic strategy template. If you can't tell from reading it whether FeedZero or NetNewsWire wrote it, sharpen it.
- Do **not** commit. Leave the working tree dirty for the user to review.

## Invocation patterns

```
/research-competitors                       # full landscape
/research-competitors readwise-reader       # one competitor
/research-competitors pricing               # one theme
/loop 7d /research-competitors              # weekly while session is open
```
