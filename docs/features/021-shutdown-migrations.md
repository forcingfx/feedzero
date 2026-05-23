# Feature 021: Shutdown Migrations

## Status
Implemented (parsers + import dispatch + welcome hint). Landing pages
deployment tracked in [`docs/marketing/TODO.md`](../marketing/TODO.md).

## Summary

Refugees from four shutdown competitors in the last 19 months
([strategy 001](../strategy/001-competitor-scan.md)) — Pocket, Omnivore,
Tiny Tiny RSS, Artifact — need somewhere to land. This feature ships
the in-app half of the migration story: parsers that ingest each
service's export format, an import-view dispatcher that auto-detects
which one was pasted/dropped, and an onboarding hint that names the
supported shutdowns explicitly so refugees recognise their export type.

The landing-page half lives in the [`feedzero-landing`](../marketing/)
repo and is shipped via the prompt at
[`docs/marketing/LANDING_PROMPT.md`](../marketing/LANDING_PROMPT.md).

## Behaviour

```gherkin
Feature: Shutdown migrations

  Scenario: Pocket HTML export
    Given the user has a pocket-export.html from getpocket.com/export
    When they drop it into Settings → Import
    Then unique site origins are extracted (one per host)
    And each origin is fed into addFeedFlow for RSS discovery

  Scenario: Pocket CSV export
    Given the user has a pocket-export.csv with `title, url, time_added` columns
    When they drop it into Settings → Import
    Then unique site origins are extracted from the url column
    And each origin is fed into addFeedFlow for RSS discovery

  Scenario: Omnivore JSON export
    Given the user has an Omnivore metadata.json (array of articles with `url` + `savedAt`)
    When they drop it into Settings → Import
    Then unique site origins are extracted from each article's url field
    And each origin is fed into addFeedFlow for RSS discovery

  Scenario: TT-RSS OPML export
    Given the user has a tt-rss-feeds.xml exported via TT-RSS Preferences
    When they drop it into Settings → Import
    Then it routes through the existing OPML parser (feature 012)
    And folder structure is preserved

  Scenario: New user from a shutdown
    Given a new user opens FeedZero for the first time
    When they see the onboarding welcome step
    Then they see "Coming from Pocket, Omnivore, or TT-RSS? Import after setup."

  Scenario: Unknown format
    Given the user pastes content that doesn't match any specific parser
    When they click Import
    Then the URL-list fallback parses one URL per line
    And invalid lines are silently skipped
```

## Architecture

### Dispatch order

`ImportView.extractEntries` ([`src/components/settings/import-view.tsx`](../../src/components/settings/import-view.tsx))
runs detectors in specific-to-general order so a CSV / JSON payload
can't be misread as a plain URL list and silently produce garbage:

1. `isPocketCsvExport` — header row has `url` + `time_added`.
2. `isOmnivoreExport` — JSON parses to an object/array with `savedAt` + a URL field.
3. `isPocketExport` — HTML with `time_added=` anchors or `<title>Pocket Export</title>`.
4. `isOpmlFormat` — `<?xml` or `<opml` prefix.
5. `parseUrlList` — fallback, one URL per line.

### Why origins, not articles

Each parser returns **unique site origins** (`scheme://host`), not the
saved article URLs. RSS readers don't have queues. A user who saved
200 NYT articles wanted to follow NYT, not re-save 200 articles.
Origins flow through `addFeedFlow` ([`src/core/feeds/feed-service.ts`](../../src/core/feeds/feed-service.ts))
which discovers the RSS feed for each site.

### Files

| File | Role |
|------|------|
| `src/core/opml/pocket-parser.ts` | Pocket HTML + CSV parsers, format detection |
| `src/core/opml/omnivore-parser.ts` | Omnivore JSON parser, format detection |
| `src/core/opml/opml-service.ts` | OPML (TT-RSS export path) — feature 012 |
| `src/core/opml/url-list-parser.ts` | URL-list fallback |
| `src/components/settings/import-view.tsx` | Dispatcher + dropzone copy + file `accept` |
| `src/components/onboarding/steps/welcome-step.tsx` | "Coming from…" hint |
| `docs/marketing/pocket-migration.md` | Landing page copy |
| `docs/marketing/omnivore-migration.md` | Landing page copy |
| `docs/marketing/tt-rss-migration.md` | Landing page copy |
| `docs/marketing/LANDING_PROMPT.md` | Prompt for the feedzero-landing repo agent |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/opml/pocket-parser.test.ts` | HTML + CSV happy paths, edge cases, detection |
| `tests/core/opml/omnivore-parser.test.ts` | JSON shapes (array, single, url vs originalUrl), detection |
| `tests/core/opml/url-list-parser.test.ts` | Fallback parser, OPML detection (feature 012) |
| `tests/core/opml/opml-service.test.ts` | OPML round-trip (feature 012) |
| `tests/components/settings/import-view-formats.test.tsx` | Dispatcher routes CSV + JSON correctly |
| `tests/components/onboarding/welcome-step.test.tsx` | Welcome step names Pocket / Omnivore / TT-RSS |

## Design Decisions

- **Origins, not articles.** Every parser collapses saved URLs to
  unique `scheme://host` origins. RSS readers subscribe to sources,
  not queues — this mental model needs to win at the parser boundary
  or the whole UX inherits a Pocket-shaped mismatch.
- **Detection runs specific-first.** A CSV with a Pocket header would
  pass `parseUrlList` and silently dedupe to zero valid URLs. So the
  CSV / JSON / HTML / OPML detectors run before the URL-list fallback.
- **Pocket CSV ships best-effort.** Pocket shut down; there's no live
  endpoint to smoke-test against. The parser follows the documented
  `title, url, time_added, tags, status` columns and ignores anything
  else.
- **No ZIP unpacking.** Omnivore shipped a ZIP containing
  `metadata.json` + `content/*.md`. We accept the `metadata.json`
  file directly and trust the user to extract it. Adding JSZip would
  be a 100KB dependency for a one-shot import flow.
- **Welcome-step hint is text-only.** A button on the welcome step
  would force a navigation decision before the user has a passphrase.
  A one-line hint that mentions the formats achieves the
  discoverability goal at zero risk.
- **Landing pages live in a separate repo.** `feedzero.app` is a
  marketing site; the app is the React PWA. Landing-page copy lives
  in `docs/marketing/` in this repo (drafts), is deployed via the
  prompt in `LANDING_PROMPT.md`. Shipping order matters per the
  CLAUDE.md "Landing/feedzero contract changes are serialized" rule:
  the landing pages can ship before this commit lands without
  breaking anything, but the in-app imports must work before users
  click through.

## Limitations

- **Artifact has no public export format.** Refugees from Artifact
  (shut down 2024-01) can rebuild their reading list from memory or
  paste a URL list, but there's no automated path.
- **Feedly's full export** (active-competitor defection) is not yet a
  one-click path. Feedly exports OPML cleanly so it already works via
  the OPML route; a dedicated landing page is a follow-up.
- **Read state doesn't import** for any source. RSS readers don't
  have universal read-state import; users start with everything
  unread and can mark-all-as-read on day one.
- **Pocket CSV parser is single-line-per-row.** Pocket exports don't
  embed newlines inside quoted cells in practice, so the parser
  doesn't span them. If a malformed export does, those rows drop.
