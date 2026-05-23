# Landing-repo prompt — Shutdown migration pages

This is a self-contained brief for a Claude Code agent working in the
**`feedzero-landing`** repo (the marketing site at `feedzero.app`).
The in-app side (parsers, dispatcher, onboarding hint) lives in the
`feedzero` repo and is already shipped — see
[`docs/features/021-shutdown-migrations.md`](../features/021-shutdown-migrations.md).

**How to use:** paste everything below the line into a fresh agent
session opened against `feedzero-landing`. Adjust the raw GitHub URLs
if the migration markdown files have moved.

---

## Task

Deploy three migration landing pages and one homepage entry that
together absorb refugees from the four shutdown competitors of the
last 19 months (Pocket, Omnivore, Tiny Tiny RSS, Artifact).

The in-app FeedZero now handles their export formats — see the
in-app feature spec at:
https://raw.githubusercontent.com/forcingfx/feedzero/main/docs/features/021-shutdown-migrations.md

The source-of-truth copy for each landing page lives in the `feedzero`
repo at `docs/marketing/`. Fetch each markdown file via raw GitHub
URL and render its body as the page content. Front-matter feeds the
page title, meta description, and OG / Twitter Card metadata.

### Sources

- **Pocket** (shut down 2025-11-12, ~millions of users displaced):
  https://raw.githubusercontent.com/forcingfx/feedzero/main/docs/marketing/pocket-migration.md
- **Omnivore** (shut down 2024-11-15, team acquihired by ElevenLabs):
  https://raw.githubusercontent.com/forcingfx/feedzero/main/docs/marketing/omnivore-migration.md
- **TT-RSS** (original retired 2025-11-01, community fork on GitHub):
  https://raw.githubusercontent.com/forcingfx/feedzero/main/docs/marketing/tt-rss-migration.md

Each markdown file has YAML front-matter with `slug`, `title`,
`description`, and `intended_url`. Use `slug` as the route
(`/pocket`, `/omnivore`, `/tt-rss`).

### Deliverables

1. **Three routes**, one per source, at `/pocket`, `/omnivore`,
   `/tt-rss`. Each route renders the corresponding markdown body
   through the site's existing markdown renderer. If the site has no
   markdown renderer yet, use `marked` + DOMPurify (the same combo
   the FeedZero app uses) so a malicious link in the source markdown
   can't escape.

2. **Page metadata** generated from front-matter:
   - `<title>` from `title`.
   - `<meta name="description" content="…">` from `description`.
   - Open Graph: `og:title`, `og:description`, `og:url`
     (from `intended_url`), `og:type=article`.
   - Twitter Card: `twitter:card=summary`, `twitter:title`,
     `twitter:description`.
   - No `og:image` unless the site already has a generic FeedZero
     share image to point at.

3. **Homepage "Coming from…" panel.** A small section on the
   homepage (below the hero, above the fold on desktop) listing the
   three migration paths with one-line teasers and links to the
   pages. Visual weight: smaller than the primary CTA, larger than
   the footer. Suggested copy:

   > Coming from a shutdown?
   > - **Pocket** shut down 2025-11. [Where to land →](/pocket)
   > - **Omnivore** shut down 2024-11. [Where to land →](/omnivore)
   > - **TT-RSS** maintainer walked away 2025-11. [Where to land →](/tt-rss)

   Match the site's existing typography / spacing tokens; don't
   introduce new design tokens for this panel.

4. **Update sitemap.xml** (or whatever the site's equivalent is) to
   include the three new routes so search engines pick them up.

5. **Build verification.** Run the site's build + lint + type-check
   commands. The site's `CLAUDE.md` (if any) is your spec for those.

### What NOT to do

- **No analytics, no tracking pixels, no third-party scripts.** The
  FeedZero brand is built on no-telemetry; the landing site has to
  honor that. If the site already ships with an analytics script,
  ensure these pages are excluded — and raise it with the user.
- **No new dependencies beyond what the site already uses.** The
  markdown renderer and metadata helpers are the only new code
  paths; everything else reuses existing layout components.
- **Don't inline the source markdown.** Fetch from the raw GitHub
  URLs (or commit a snapshot via the build step). The point of
  keeping the copy in the feedzero repo is that strategy refreshes
  rewrite it — the landing site picks up the next version on next
  build.
- **Don't add JS-only fancy interactions.** These pages are read
  once by people who already chose us; prerendered HTML + the site's
  default CSS is the right shape.
- **Don't add a "fourth shutdown" entry for Artifact.** Artifact
  shut down 2024-01 but had no public export format — there's no
  migration path to document, only a strategy bullet.

### Acceptance criteria

- [ ] `/pocket`, `/omnivore`, `/tt-rss` render with the correct body
      content and matching `<title>` / `<meta description>`.
- [ ] OG + Twitter Card metadata validate against
      https://www.opengraph.xyz / Twitter's card validator.
- [ ] Homepage panel is visible and links work.
- [ ] `sitemap.xml` includes the three new URLs.
- [ ] Build is green; no new dependencies; no telemetry added.
- [ ] After deploy, the in-app onboarding welcome step's hint
      ("Coming from Pocket, Omnivore, or TT-RSS?") points to a real
      page if a user navigates to `/pocket` etc. from any link —
      verify by clicking through.

### After shipping

Mark the deployment boxes in
https://raw.githubusercontent.com/forcingfx/feedzero/main/docs/marketing/TODO.md
as done (via a PR to that repo, or hand the diff to the user).

The campaign-distribution checklist in the same TODO is **manual
human work** — not your task. Don't post to Reddit / HN / lobste.rs
yourself; surface the channel list to the user.

### Ship order reminder

Per the `feedzero` CLAUDE.md "Landing/feedzero contract changes are
serialized" rule: the in-app changes shipped first. Deploying these
pages now is the second half, and is non-blocking — the in-app
imports work standalone. After deploy, the next FeedZero release
will reference these pages in its changelog.
