---
name: release
description: Cut a FeedZero release with one command, unattended — derive the version from conventional commits, draft and lint the notes, open a single release PR, and let CI tag and publish the Docker image once it merges.
argument-hint: "[X.Y.Z to force a version] [--dry-run]"
---

# /release

One PR, one repository, unattended. The notes entry and the version bump land
in the same commit, so there is nothing to sequence and nothing to poll.

## Inputs

- Optional explicit version `X.Y.Z` (else derived from conventional commits).
- `--dry-run`: compute, draft and lint; print everything; make NO writes.

## Preconditions (ABORT if any fail)

1. Working tree clean and up to date (`git fetch && git status`).
2. `npm test` and `npx tsc --noEmit` green.
3. Ship authority present (`Bash(gh pr merge:*)` in
   `.claude/settings.local.json`), or the run stops at the PR.

## Steps

1. **Last version**:
   `node -e "import('./release-notes.mjs').then(m=>console.log(m.releases[0].version))"`.
2. **Commits since**: find the boundary — the `release: v<last>` commit or the
   `v<last>` tag — then `git log --pretty=%s <boundary>..HEAD`.
3. **Version**: `computeVersion(last, subjects)` from
   `scripts/release/compute-version.ts`. `null` → ABORT "nothing to release".
   An explicit `X.Y.Z` argument wins.
4. **Draft notes**: `draftNotes(subjects, { version, date: <now ISO> })` from
   `scripts/release/draft-notes.ts`.
5. **Lint**: `lintNotes(entry)` from `scripts/release/lint-notes.ts`. Auto-fix
   `fixable` violations (append period, em-dash→comma, strip `!`); anything
   else → ABORT and show it. Hand-edit for tone — the lint only enforces
   mechanics.
6. **--dry-run?** print the version and entry, then STOP.
7. **Open the release PR** — one worktree, one commit, both changes together:

```bash
git -C ~/builder/feedzero worktree add ~/builder/feedzero-wt-release-<version> \
  -b release/v<version> origin/main
cd ~/builder/feedzero-wt-release-<version>
ln -s ~/builder/feedzero/node_modules node_modules

# Prepend the entry to the `releases` array in release-notes.mjs, then:
npm version <version> --no-git-tag-version
npm test                    # the version-lock test proves notes == package.json

git add release-notes.mjs package.json package-lock.json
git commit -m "release: v<version>"
git push -u origin release/v<version>
gh pr create --head release/v<version> --base main \
  --title "release: v<version>" \
  --body "Release notes entry plus the version bump. Tag and image publish follow automatically once this merges (release-tag.yml)."
gh pr merge --squash --auto --delete-branch
```

8. **Report**: the PR link and what follows. The user can walk away — the PR
   merges itself once checks pass, Vercel deploys (the feed goes live with
   it), and `release-tag.yml` tags `v<version>` and publishes the image.
9. **Verify** once merged:

```bash
gh run watch "$(gh run list --workflow=release-tag.yml -L1 --json databaseId --jq '.[0].databaseId')" --exit-status
curl -sSL https://feedzero.app/releases.xml | grep -c "feedzero:release:<version>"
docker run --rm --entrypoint sh ghcr.io/forcingfx/feedzero:v<version> \
  -c 'node -p "require(\"/app/package.json\").version"'
```

10. **Tear down** the worktree.

## Notes

- **Never change existing `<id>` values** (`feedzero:release:*`,
  `feedzero:changelog`). Changing one makes every subscriber re-import every
  old entry as new.
- **Never `git tag` by hand.** `release-tag.yml` derives the tag from
  `package.json` on `main` and refuses if the notes disagree. Hand-tagging is
  the v0.11.0 shape, whose published image reported 0.9.0 (#211/#212).
- **The feed is served from this repo.** `scripts/release/build-feed.mjs`
  emits `public/releases.xml` during the build; landing rewrites
  `feedzero.app/releases.xml` to it, so the public URL and every entry id are
  unchanged. A release has no landing step.
- **Landing's homepage accordion** renders from its own `releases.mjs` mirror.
  It is not on the release path; a stale accordion corrects itself on the next
  landing deploy and never affects the feed subscribers read.
- **Why the bump is a PR and not a CI push:** `forcingfx` is a *user* account,
  so the `main protection` ruleset cannot grant the GitHub Actions app a
  bypass — GitHub only allows Integration bypass actors on org-owned repos.
  Every CI push to `main` is rejected with `GH013`. The predecessor
  `release.yml` pushed directly and could never have succeeded.
- **Resume after partial failure**: if `release-notes.mjs` already has an entry
  for `<version>`, skip steps 4–5 and resume at step 7.
- Screenshots, bento cards and social posts are out of scope; run those
  separately.
