# Marketing screenshots

Per-feature product screenshots used by the landing redesign
(`forcingfx/feedzero-landing`). The landing build fetches these as raw
URLs from `main`, so any changes here ship live on the next deploy.

## Files

| Filename                       | Depicts                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `feature-any-feed.png`         | Explore URL input with the discovery chip — RSS / **Atom** / JSON Feed pills + "Example Blog · Press Enter to add" |
| `feature-sync.png`             | SetupWizard with the four-word passphrase + the persistent "Synced · 1 min ago" pill in the top-right corner |
| `feature-keyboard.png`         | Settings → Help, keyboard-shortcuts card with `j` `k` `u` `o` …                          |
| `feature-switch-readers.png`   | Pre-import preview tree — folders with feed counts, OPML provenance ("Imported from you 'My subscriptions'") and the "Import 11 feeds" confirmation |
| `feature-starring.png`         | Sidebar "Starred" selected, list of starred articles, filled-star reader                 |
| `feature-auto-organize.png`    | Sidebar after Auto-organize — Business / Culture / Lifestyle / News colour-coded folders |
| `feature-smart-filters.png`    | Smart-filter editor dialog with three stacked conditions and a live match count          |
| `feature-discover.png`         | Explore → Featured tab with the curated catalog and per-row "Add" buttons                |
| `feature-full-text.png`        | Reader pane in "Full text" mode rendering an extracted article body                      |

Each PNG: **1920×1200 physical pixels** (sized for HiDPI render at
960×600 CSS), white background, no browser chrome, no annotations.
Compressed with `pngquant --quality=70-90`, all under ~250 KB.

## How to regenerate

```bash
node scripts/capture-marketing.mjs
```

The script:

1. Boots `vite --port 3001 --strictPort` as a child process.
2. Opens Playwright (Chromium) at 1280×800 CSS × 1.5 DPR — enough to
   trigger the desktop two-pane layout, output exactly 1920×1200.
3. Drives the silent local-only onboarding (no welcome screen — the
   app auto-initialises a fresh DB).
4. Seeds 20 neutral demo feeds + 36 articles into the live IndexedDB
   by dynamic-importing `src/core/storage/db.ts` from the dev server.
   No real publications, no real authors — generic archetypes only
   (Tech Weekly, Developer Notes, Markets Today, etc.).
5. Walks the nine scenes, screenshotting the result of each.
6. Runs `pngquant` on every output so the bytes stay under budget.

The script is idempotent — overwrites `docs/marketing/screenshots/*`
on every run. If port 3001 is already in use, it refuses to share an
existing server and exits with a clear error.

## Sample data is neutral by design

Feed titles, article titles, and the featured article body are all
synthetic. The featured full-text article opens with a one-line
"This is a synthetic article used for product screenshots" disclaimer
so a curious reader can't mistake it for the work of a real author.
URLs use `feeds.example.com` / `example.com` so they don't resolve
to any third-party site.
