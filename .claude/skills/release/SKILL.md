---
name: release
description: Cut a FeedZero release end-to-end and unattended — draft curated landing notes, publish the changelog feed (landing first), then trigger CI to bump, tag, and publish the Docker image. Version is auto-derived from conventional commits.
argument-hint: "[X.Y.Z to force a version] [--dry-run]"
---

# /release

Cut a release with one command. Supersedes the old `/new-release` (which
never created a git tag and had stale paths).

## Inputs
- Optional explicit version `X.Y.Z` (else derived from conventional commits).
- `--dry-run`: compute + draft + lint and print everything; make NO writes.

## Preconditions (ABORT if any fail)
1. feedzero working tree clean, on `main`, up to date (`git fetch && git status`).
2. `npm test` and `npx -p typescript@6.0.3 tsc --noEmit` both green.
3. Landing repo present at `../feedzero-landing`, clean, on `main`.

## Steps

1. **Last version**:
   `node -e "import('../feedzero-landing/releases.mjs').then(m=>console.log(m.releases[0].version))"`.
2. **Commits since**: find the boundary — the commit that bumped to the last
   version (search `git log` for `release: v<last>` or the tag `v<last>`),
   then `git log --pretty=%s <boundary>..HEAD`. Collect the subject lines.
3. **Version**: import `scripts/release/compute-version.mjs`;
   `computeVersion(last, subjects)`. If `null` → ABORT "nothing to release".
   If an explicit `X.Y.Z` arg was given, use it instead.
4. **Draft notes**: `draftNotes(subjects, { version, date: <now ISO> })` from
   `scripts/release/draft-notes.mjs`.
5. **Lint**: `lintNotes(entry)` from `scripts/release/lint-notes.mjs`.
   Auto-fix `fixable` violations (append period, em-dash→comma, strip `!`);
   if any non-fixable remain → ABORT and show them. Hand-edit the draft entry
   for tone before continuing — the lint only enforces mechanics.
6. **--dry-run?** print the version + entry + planned git ops and STOP here.
7. **Write landing**: prepend the entry object to the `releases` array in
   `../feedzero-landing/releases.mjs`, then
   `cd ../feedzero-landing && node build-releases.mjs`. Verify `releases.xml`'s
   first `<entry>` is the new version.
8. **Push landing FIRST**:
   `cd ../feedzero-landing && git add releases.mjs releases.xml index.html && git commit -m "release: v<version> — <title>" && git push origin main`.
9. **Wait for landing live**: poll `https://feedzero.app/releases.xml` (every
   15s, up to ~5 min) until it contains `feedzero:release:<version>`. Timeout
   → ABORT (do NOT trigger feedzero; the landing-first invariant must hold).
10. **Trigger feedzero CI**:
    `gh workflow run release.yml --repo forcingfx/feedzero -f version=<version>`.
11. **Report**: print the landing commit, the feed URL, and the CI run link
    (`gh run list --workflow=release.yml -L1`). Done — the user can walk away;
    CI bumps `package.json`, refreshes the fixture, tests, tags, and publishes.

## Notes
- NEVER change existing `<id>` values (`feedzero:release:*`,
  `feedzero:changelog`) — that makes every subscriber re-import old entries.
- Notes are editable after the fact: edit `releases.mjs`, re-run
  `build-releases.mjs`, push landing.
- **Resume after partial failure**: if `releases.mjs` already has an entry for
  `<version>`, skip steps 4–8 and resume at step 9 (poll) → 10 (trigger CI).
- Screenshot / bento card / LinkedIn post are out of scope here — run those
  manually if wanted.
- One-time setup (Actions write permission, or PAT fallback) is documented in
  `docs/operations/self-host-image-publishing.md`.
