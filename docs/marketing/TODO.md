# Marketing TODO

Status: copy drafted, deployment + campaigns not yet executed. This file tracks the work that has to happen *outside* this repo before the migration story actually lands.

> **For the landing-repo agent**: a self-contained brief is at
> [`LANDING_PROMPT.md`](./LANDING_PROMPT.md). Paste it into a fresh
> Claude Code session opened against the `feedzero-landing` repo to
> ship the three pages + homepage panel below.

## Per-page deployment

The landing pages live as markdown here. The actual landing site (`feedzero.app`) is a separate repo. Each page below needs:

- [ ] **Pocket migration page** — deploy `pocket-migration.md` content to `https://feedzero.app/pocket`.
- [ ] **Omnivore migration page** — deploy `omnivore-migration.md` content to `https://feedzero.app/omnivore`.
- [ ] **TT-RSS migration page** — deploy `tt-rss-migration.md` content to `https://feedzero.app/tt-rss`.

Each deployed page should:
- Render the markdown body (front-matter strips into the page title + meta description).
- Include the standard FeedZero header / footer / cookie-free analytics (we don't have analytics — nothing to add).
- Add Open Graph + Twitter Card metadata using the front-matter `title` + `description`.
- Link the migration page from the homepage in a small "Coming from…" section.

## Campaign distribution

Once the pages are live, push to channels in this order. Time-sensitive — the migration window narrows as users settle on whichever alternative they tried first.

### Channels — Pocket

- [ ] **r/rss** — short post linking to the migration page. Include a one-line description of FeedZero. Mod-tag if applicable.
- [ ] **r/RSS_Readers** — same.
- [ ] **r/privacy** — emphasize the E2E sync angle, not the import.
- [ ] **r/selfhosted** — emphasize the self-host story; the audience here will pick FreshRSS otherwise.
- [ ] **Hacker News Show HN** — title: "Show HN: FeedZero — RSS reader for Pocket refugees who care about privacy."
- [ ] **lobste.rs** — link under the `web` tag with a one-paragraph context comment.
- [ ] **Privacy Guides community** — comment on the existing RSS-recommendation thread (don't post a new one).
- [ ] **Direct outreach** — Pocket-power-user newsletter writers; Daring Fireball / Macstories / TechCrunch (Pocket shutdown coverage is still indexing).

### Channels — Omnivore

- [ ] **r/rss / r/RSS_Readers / r/privacy** — short post per sub.
- [ ] **Hacker News** — combined "Two RSS readers built differently than the ones that shut down" post. Show HN restrictions: confirm timing rules.
- [ ] **omnivore.work community fork README** — open a PR adding FeedZero to a "alternatives if you don't want to self-host" line.
- [ ] **Existing Omnivore migration round-ups** — comment on the top 5 (Readless, Gleamr, Notes by ghed.in) with the migration page link.

### Channels — TT-RSS

- [ ] **r/selfhosted** — the only sub that matters for this audience.
- [ ] **awesome-selfhosted** — PR to add FeedZero with the right tags.
- [ ] **selfh.st** — submit FeedZero as an alternative to TT-RSS.
- [ ] **Don't post on r/rss** — TT-RSS users overlap less with that audience; signal-to-noise low.

## Hygiene

- [ ] **No paid acquisition.** Per [strategy §2](../strategy/003-playing-to-win.md), paid channels contradict the privacy stance.
- [ ] **No SEO content farms.** Same reason.
- [ ] **One round of campaign distribution.** Repeating the same post across subs in a 7-day window will get us shadow-banned and is bad form.
- [ ] **Track effect via vault count.** `/api/stats-sync` is the only legitimate metric the architecture allows. Snapshot before each campaign push, snapshot 7 days after, log the delta in the next `docs/strategy/runs/` entry.

## Open questions

- Which one to ship first? Pocket has the largest audience but coldest trail (7 months stale by now). TT-RSS is the freshest (just 6 months out) but smallest audience. Omnivore is in between. **Recommendation: Pocket first because of audience size — even a cold-trail conversion adds compounding word-of-mouth.**
- Should the homepage carry a permanent "Coming from a shutdown?" panel, or is that a sign we're over-indexing on a transient acquisition channel? Discuss before deploying.
- Per-shutdown migration pages SEO well in the short term but rot once the audience has resettled. Add a `created_at` to front-matter, and revisit each page 12 months after publishing — delete or rewrite as "in memoriam" archival pages.
