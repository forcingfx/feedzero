# Marketing copy

Migration landing pages and product positioning copy live here as markdown. The actual public site at [feedzero.app](https://feedzero.app) is in a separate repo (see CLAUDE.md). These files are the source of truth for the copy; deploying them is tracked in [TODO.md](./TODO.md).

## Why these are versioned in this repo

- The copy makes claims about FeedZero's architecture (E2E sync, OPML round-trip, self-host story). Those claims must stay in lockstep with the code. Co-locating the copy with the code makes drift a code-review concern, not an oversight.
- The strategy doc ([../strategy/003-playing-to-win.md](../strategy/003-playing-to-win.md) §2) calls out per-shutdown migration pages as the highest-leverage acquisition channel currently available. Tracking the copy here makes the pipeline auditable.

## What's here

| File | Purpose |
|------|---------|
| `pocket-migration.md` | Landing copy for users displaced by Pocket's 2025-11-12 shutdown. |
| `omnivore-migration.md` | Landing copy for users displaced by Omnivore's 2024-11-15 shutdown. |
| `tt-rss-migration.md` | Landing copy for users whose Tiny Tiny RSS instance is now community-fork-only after the original maintainer retired the project 2025-11-01. |
| `TODO.md` | Deployment + campaign checklist — what hasn't happened yet. |
