# Worktrees

The full worktree procedure. `CLAUDE.md` keeps the triggers and prohibitions inline; the recipe, naming and `node_modules` handling live here.

The 2026-05-16 deeplink-hotfix incident proved that "I'll just stash and switch in the main tree" is unsafe even for one-file fixes. A branch switch during agent work intermingled hotfix edits with pre-existing WIP and took an hour to untangle. These rules exist so it can't happen again.

**ALWAYS create a worktree when ANY of these is true:**

1. `git status` shows ANY modified file or untracked file in the working tree that you didn't author this session.
2. You are about to work on a branch other than the one currently checked out, AND the current branch has uncommitted changes (yours or theirs).
3. Another agent may be operating in this repo (assume yes unless explicitly told otherwise).
4. The task is a hotfix that should ship independently of any in-progress feature work.
5. You expect to run a long-lived dev server, test watcher, or other process that would conflict with another agent's process on the same port.

**NEVER do any of these in the main working tree when the above triggers fire:**

- `git stash` + `git switch` to a different branch — the stash can be lost, popped wrong, or skipped silently. Forbidden as a substitute for a worktree.
- `git switch` to a different branch with uncommitted changes in the working tree, hoping git "carries them along compatibly." It might. It might also intermingle them with another branch's content.
- `git checkout <ref>` of any kind when you have uncommitted work — same failure mode as above.
- Run a hotfix and a feature in the same working tree by switching between branches.

**Worktree command recipe:**

```bash
# Create — always from origin/main unless explicitly told otherwise
git -C ~/builder/feedzero worktree add ~/builder/feedzero-wt-<slug> -b <branch-name> origin/main

# Work
cd ~/builder/feedzero-wt-<slug>
# … RGR cycles, commits, push, PR …

# Tear down after merge (or after explicit user say-so)
git -C ~/builder/feedzero worktree remove ~/builder/feedzero-wt-<slug>
git -C ~/builder/feedzero branch -D <branch-name>   # if not auto-deleted by gh
```

Naming: `<slug>` is a 2–3 word kebab-case description of the work — `deeplink-fix`, `paid-tier-gating`, `release-cut`. No timestamps; the branch name carries the lifecycle.

**`node_modules` cost:** Each worktree needs `node_modules` for dev/test. For short-lived hotfixes that only need `npx tsc --noEmit` and targeted `npx vitest run <path>`, skip `npm install` — vitest and tsc resolve from the symlinked `node_modules`:

```bash
ln -s ~/builder/feedzero/node_modules ~/builder/feedzero-wt-<slug>/node_modules
```

For worktrees that need a dev server (`npm run dev`), run `npm install` in the worktree (symlink can fail on some toolchains that resolve `realpath`).

**Announce the worktree decision:** Before running `worktree add`, state the trigger and the slug ("Triggering rule 1 — uncommitted changes in main tree. Creating `feedzero-wt-deeplink-fix`."). The user can redirect if they prefer a different layout.
