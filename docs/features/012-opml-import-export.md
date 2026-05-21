# Feature 012: OPML Import/Export

## Status
Implemented

## Summary

Import and export feed subscriptions using the OPML standard format. Users can import feeds via file upload or pasted text (OPML or plain URL list), and export their subscriptions as OPML file download or copied URL list. This enables migration to/from other feed readers and backup of subscriptions.

## Behaviour

```gherkin
Feature: OPML Import/Export

  Scenario: Import feeds from OPML file
    Given the user has an OPML file with feed subscriptions
    When the user opens Settings, selects Import, uploads the file
    Then the app parses the OPML and imports each feed URL
    And shows progress during import
    And displays a summary of successful/failed imports

  Scenario: Import feeds from pasted OPML text
    Given the user has OPML XML content copied
    When the user opens Settings, selects Import > Text, pastes the OPML
    And clicks "Import feeds"
    Then the app detects OPML format and imports the feeds

  Scenario: Import feeds from pasted URL list
    Given the user has a list of feed URLs (one per line)
    When the user opens Settings, selects Import > Text, pastes the URLs
    And clicks "Import feeds"
    Then the app parses each URL and imports the feeds

  Scenario: Export feeds as OPML file
    Given the user has feeds subscribed
    When the user opens Settings, selects Export
    And clicks "Download OPML"
    Then the browser downloads an OPML file with all subscriptions

  Scenario: Export feeds as URL list
    Given the user has feeds subscribed
    When the user opens Settings, selects Export
    And clicks the copy button on the URL list
    Then the URLs are copied to clipboard

  Scenario: Import with partial failures
    Given the user imports 5 feeds
    And 3 succeed, 1 is rate-limited (HTTP 429), and 1 is not a feed
    Then the results view shows "3 feeds added, 1 queued for retry, 1 failed"
    And the rate-limited feed appears in the sidebar with a red error icon
    And pressing "r" after the upstream recovers clears the error and
    backfills the feed's title and articles in place
```

## Architecture

### Flow

**Import Flow:**
1. User opens Settings dialog via gear icon in sidebar footer
2. User selects Import view and chooses File or Text input mode
3. User provides OPML file or pastes text (OPML or URL list)
4. `isOpmlFormat()` detects format, routes to appropriate parser
5. `parseOpmlFile()` or `parseUrlList()` extracts feed URLs
6. Import store transitions to `importing` status
7. For each URL, `addFeed()` is called sequentially:
   - **Success** → recorded as `success: true`
   - **`reason: "fetch-failure"`** (HTTP / network error) → falls
     through to `addPlaceholderFeed(url, error)`, which persists a
     Feed row with the URL-derived title and `lastError` set. Recorded
     as `success: true, placeholder: true`. The user can hit "r" or
     right-click → Refresh later to retry; the first successful
     refresh upgrades the row in place (clears `lastError`, backfills
     title/description/siteUrl from the parsed payload).
   - **Other err** (parse / discovery / duplicate / quota) → recorded
     as `success: false`; no row created. These won't recover via
     refresh, so a placeholder would just be sidebar noise.
8. Results are recorded with the 3-bucket discriminator
9. Import store transitions to `complete`, showing the breakdown:
   "N feeds added, M queued for retry, K failed"
10. User clicks "Done" to close or "Import more" to reset

**Export Flow:**
1. User opens Settings dialog, selects Export view
2. `generateOpmlFile()` creates OPML XML from feeds
3. `generateUrlList()` creates newline-separated URL text
4. OPML Download: creates Blob, triggers download as `.opml` file
5. URL Copy: copies text to clipboard via `navigator.clipboard`

### Files

| File | Role |
|------|------|
| `src/core/opml/opml-service.ts` | OPML parsing and generation using feedsmith |
| `src/core/opml/url-list-parser.ts` | Plain text URL list parsing with validation |
| `src/stores/import-store.ts` | State machine for import progress tracking |
| `src/components/settings/settings-dialog.tsx` | Main settings dialog container |
| `src/components/settings/import-view.tsx` | Import UI with file/text toggle |
| `src/components/settings/export-view.tsx` | Export UI with download/copy |
| `src/components/settings/import-progress.tsx` | Progress bar during import |
| `src/components/settings/import-results.tsx` | Success/failure summary |
| `src/components/layout/app-sidebar.tsx` | Settings button integration |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/opml/opml-service.test.ts` | OPML parse/generate, nested folders, edge cases |
| `tests/core/opml/url-list-parser.test.ts` | URL parsing, comments, dedup, format detection |
| `tests/stores/import-store.test.ts` | State machine, selectors, progress tracking |
| `tests/components/settings/import-view-placeholder.test.tsx` | Placeholder-on-fetch-failure routing into folders |
| `tests/integration/feed-store-db.test.ts` | Placeholder lifecycle round-trip through real encrypted DB |
| `tests/e2e/import-export.spec.ts` | Full import/export flows in browser |
| `tests/e2e/import-recovery.spec.ts` | Placeholder → refresh → recover, browser-side |

## Design Decisions

- **feedsmith library** — Uses feedsmith for all OPML parsing/generation. Same library now handles RSS/Atom/JSON Feed parsing, providing consistency and reducing dependencies.

- **Flatten nested folders** — OPML supports nested folder structure. For v1, folders are flattened and only feed entries (outlines with `xmlUrl`) are extracted. Folder organization can be added later.

- **Sequential import** — Feeds are imported one at a time rather than in parallel. This provides clear progress feedback and avoids overwhelming the API proxy with concurrent requests.

- **Text export format** — Export as plain URLs (one per line) rather than titles or other metadata. This is the most portable format for pasting into other tools.

- **Access via Add Feed popover** — Import/Export is accessed from the "+" (Add Feed) button in the sidebar header, with an "or Import / Export OPML" option. This keeps feed-related actions together and avoids cluttering the footer.

- **Auto-detect format** — When pasting text, the app auto-detects whether it's OPML XML or a plain URL list by checking for XML markers, eliminating the need for users to specify format.

- **URL normalization** — URLs without protocol are auto-prefixed with `https://`. Invalid URLs are silently filtered rather than failing the entire import.

- **Recoverable failures become placeholders** — A URL that fails with an HTTP error (429/503/4xx/5xx) or a network error is persisted as a placeholder Feed with `lastError` set and `lastSuccessfulFetchAt` left undefined. The sidebar surfaces these with a red `XCircle` icon distinct from the amber "stale" indicator. Hitting "r" or right-click → Refresh retries the fetch; the first success upgrades the placeholder in place (clears `lastError`, backfills metadata). Parse / discovery / duplicate failures stay rejected because refresh can't recover them. Issue #117 follow-up — large self-host imports on fresh IPs trip upstream rate-limits, and re-typing URLs to recover broken rows was tedious. Placeholders also preserve the OPML folder structure, so a recovered feed stays in the folder the user intended.

## Limitations

- File upload is limited to `.opml` and `.xml` extensions
- No folder/category support in v1 (all feeds are flat)
- No import progress cancellation (once started, all URLs are processed)
- Duplicate detection is handled by the existing `addFeed` flow, not pre-filtered
