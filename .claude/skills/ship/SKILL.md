---
name: ship
description: Take a change from working tree to verified-live production, unattended, in under ten minutes. Local gate, PR, CI, auto-merge, then prove the exact commit is serving traffic.
argument-hint: "[commit subject] [--draft to stop before auto-merge]"
---

# /ship

One command from working tree to verified production. Nothing here weakens
verification: all seven required checks still gate the merge. What is removed
is the *waiting*.

## Preconditions (ABORT if any fail)

1. `git status` shows only changes **you** authored this session. Anything
   else → create a worktree instead (CLAUDE.md multi-agent rules) and ship
   from there. Never stash-and-switch.
2. Ship authority is present: `.claude/settings.local.json` must contain the
   `Bash(gh pr merge:*)` permission rule. Without it every step past the PR
   stops for the operator, and this skill's promise does not hold.
3. Not on `main` with uncommitted work belonging to someone else.

## Phase 1 — Local gate (~40s)

Fail here and nothing has left the machine.

```bash
npx tsc --noEmit
npx vitest run <paths covering the change>     # full `npm test` if unsure
```

Both must be clean. A red local gate ends the run; do not push "to see what
CI says" — CI is 2 minutes of shared resource for an answer you can have in
40 seconds.

## Phase 2 — Publish

```bash
git switch -c <type>/<slug>
git add <paths>            # never `git add -A` in a worktree: a node_modules
                           # symlink slipped in that way (see repo-hygiene test)
git commit -m "<conventional subject>"
git push -u origin <type>/<slug>
gh pr create --head <type>/<slug> --base main --title "..." --body "..."
```

Bug fixes need the four sections (What / Why / Fix / Prevention). PR body
should say what changed and how it was verified.

## Phase 3 — CI + auto-merge (~2 min)

```bash
gh pr merge <n> --squash --auto --delete-branch
gh pr checks <n> --watch --interval 30
```

Auto-merge lands the PR the moment the checks pass. A red check leaves the PR
open and unmerged — fix and push, and it lands when green. It never merges
red.

## Phase 4 — Verify live (~2 min)

Merging is not shipping. Prove the exact commit is serving traffic:

```bash
SHA=$(git rev-parse origin/main)            # after the merge lands
node scripts/ship/verify-deploy.mjs https://my.feedzero.app "$SHA"
```

This polls `/api/health` until it reports the merged commit. Waiting a fixed
interval instead is how a green deploy report ends up accompanying stale
code.

If it times out: report the failure and link the Vercel deployment. **Do not
auto-revert** — whether a bad deploy warrants a revert is a judgement about
user impact, and that call is the operator's.

## Phase 5 — Report

State plainly: what shipped, the PR, the commit now live, and anything that
failed on the way. If tests were skipped or a check was retried, say so.

## Budget

| Phase | Typical |
|---|---|
| Local gate | 40s |
| CI | 2 min |
| Deploy + verify | 2 min |
| **Total** | **~5 min** |

If a run exceeds ten minutes, something is wrong — say so rather than
quietly waiting.

## Notes

- **Releases do not use this skill.** Use `/release`, which adds the notes
  entry and version bump and lets `release-tag.yml` tag and publish.
- **No merge queue.** Auto-merge lands green PRs directly. The `merge_group`
  wiring in the workflows is dormant and can be enabled in ruleset 16445501
  if PR volume ever makes the update-branch treadmill hurt again.
- **Why `commit` and not `version`:** most changes ship without a version
  bump, so version cannot answer "is my change live?". The commit can.
