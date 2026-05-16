# Strategy

Living strategy docs for FeedZero. These are **not** implementation specs — see `docs/features/` for those. These docs answer "what are we trying to win at, against whom, and how?"

## Documents

| File | Purpose | Update cadence |
|------|---------|----------------|
| `001-competitor-scan.md` | Sorted table of every RSS reader + adjacent product worth tracking, with pricing, positioning, and what we learn from each. | Each run. Rewritten in place. |
| `002-user-pain-points.md` | Themed clusters of complaints + feature requests from r/rss, r/RSS_Readers, r/selfhosted, and competitor reviews. | Each run. Themes accrete; quotes refresh. |
| `003-playing-to-win.md` | Lafley + Martin's 5-question cascade applied to FeedZero. The strategy. Changed sections marked with `<!-- changed YYYY-MM-DD -->`. | Each run. Revised, not replaced. |
| `runs/YYYY-MM-DD.md` | Dated audit log per refresh: sources scanned, key findings, cascade changes, open questions. | One per run. Append-only — historical record. |

## How to refresh

Invoke from any Claude Code session in this repo:

```
/research-competitors                       # full landscape (default)
/research-competitors readwise-reader       # deep dive one competitor
/research-competitors pricing               # one theme across all competitors
/loop 7d /research-competitors              # weekly while a session stays open
```

The command does the scanning, synthesis, and writing. It does not auto-commit — review the diff before merging.

## Caveat on `/loop`

`/loop` is session-bound. A weekly cadence requires either (a) leaving a session running for a week, (b) invoking manually each Monday, or (c) a future GitHub Action cron that runs `/research-competitors` headless. Option (c) is out of scope until the doc shape stabilizes.

## Why this lives in `docs/`, not Notion / Confluence / a wiki

- **Auditable history.** `git log docs/strategy/003-playing-to-win.md` shows the strategy's evolution.
- **Diffable.** Each refresh produces a reviewable PR-shaped change, not an opaque overwrite.
- **Co-located with the code that implements it.** Capabilities the cascade calls out (full-text extraction, E2E sync) map directly to `src/core/` modules. Closing the loop is one `grep` away.
- **No vendor lock-in.** Same logic as the product itself.
