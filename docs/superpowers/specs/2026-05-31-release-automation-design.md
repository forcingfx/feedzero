# `/release` — one-command release automation

- **Date:** 2026-05-31
- **Status:** Approved design, pre-implementation
- **Author:** maintainer + Claude
- **Supersedes:** the `/new-release` skill (which never created a git tag and had stale `/kindle/` paths)

## Goal

Type `/release` (optionally `/release X.Y.Z`) and have a complete, correct
release happen end to end with no further interaction: draft the curated
landing release notes, publish the landing changelog feed, then bump,
tag, and publish the feedzero Docker image — in the order that keeps the
app's "What's new" feed from 404ing.

### Success criteria

1. A single command produces: a new `releases.mjs` entry + regenerated
   `releases.xml` (landing, deployed first), an updated `package.json` +
   vendored fixture + git tag `vX.Y.Z` (feedzero), and a published
   multi-arch image at `ghcr.io/forcingfx/feedzero:{vX.Y.Z,X.Y,latest}`.
2. The version is **identical** in all four places: landing `releases.mjs`,
   feedzero `package.json`, the vendored fixture, and the git tag.
3. A release that would be wrong (tests red, version mismatch, landing not
   live) **cannot ship** — it aborts before the irreversible step.
4. No manual version typing in the common case (derived from commits).

## Decisions (resolved during brainstorming)

| Fork | Decision |
|---|---|
| Release-notes authoring | **Fully unattended draft** from the git log, rewritten to house style, with a non-negotiable style **lint** gate; notes remain amendable later (entry IDs preserved). |
| Execution model | **Hybrid**: a local Claude skill owns the creative + landing side; **CI** owns the feedzero bump/tag/publish, triggered only *after* landing is confirmed live. |
| Version source | **Auto from conventional commits** since the last release (`feat`→minor, `fix`→patch, `feat!`/`BREAKING CHANGE`→major); `/release X.Y.Z` overrides. |
| Publish trigger | **Reusable workflow**: `docker-publish.yml` gains `workflow_call`; `release.yml` calls it after tagging. (Avoids the "`GITHUB_TOKEN`-pushed tag doesn't trigger workflows" gotcha and needs no extra token.) |
| Bump commit | `release.yml` commits the version bump to `main` via `GITHUB_TOKEN`. Requires Actions be allowed to push to `main`. Documented fallback: push the tag with a fine-scoped PAT and let the existing tag trigger fire. |

## Architecture

```
LOCAL  (/release skill)                         CI  (feedzero release.yml)
─────────────────────────                       ──────────────────────────
1 preflight: both repos clean + on main +
  fetched; feedzero `npm test` + `tsc` green
  (ABORT otherwise)
2 version = computeVersion(lastVersion, commits)
  (or the explicit override arg)
3 entry = draftNotes(commits)  → house style
4 violations = lintNotes(entry); auto-fix the
  fixable, ABORT on the rest
5 prepend entry to releases.mjs;
  `node build-releases.mjs`
6 commit + push LANDING
7 poll https://feedzero.app/releases.xml until
  feedzero:release:<version> is live  (timeout → ABORT)
8 `gh workflow run release.yml -f version=X.Y.Z`  ──▶  9 checkout main
  (skill done; safe to walk away)                     10 set package.json version
                                                       11 cp landing releases.xml → tests/fixtures/
                                                       12 `npm test` + `tsc`  (ABORT, nothing tagged)
                                                       13 commit bump to main
                                                       14 create + push tag vX.Y.Z
                                                       15 uses: docker-publish.yml (workflow_call)
                                                          → multi-arch build → GHCR
```

## Components

Each unit is independently testable; the logic lives in pure modules so the
git/network glue stays thin.

### 1. `scripts/release/` — pure logic (Vitest-covered)

Framework-free ESM, no git/network/fs side effects in the core functions
(callers pass data in, get data out).

- **`compute-version.mjs`** — `computeVersion(lastVersion: string, commits: Commit[]): string`.
  Classifies each conventional-commit subject; returns the next semver.
  Rules: any `feat!`/`BREAKING CHANGE` → major; else any `feat` → minor;
  else any `fix`/`perf` → patch. If there are *no releasable commits* (only
  `chore`/`docs`/`test`/`ci`/`build`), it returns `null` and the skill
  aborts with "nothing to release" — the empty-release guard lives here so
  it's unit-tested. Pure function of its inputs.
- **`draft-notes.mjs`** — `draftNotes(commits, { version, date }): ReleaseEntry`.
  Maps commit types to Keep-a-Changelog sections (`feat`→added,
  `fix`→fixed, `refactor`/`perf`/`style`/`chore` user-facing→changed,
  reverts→changed), strips the conventional prefix + scope, rewrites each
  subject to a verb-led past-tense sentence ending in a period, derives
  `title`/`subtitle` from the highest-impact change. Returns the entry
  object shape `releases.mjs` already uses.
- **`lint-notes.mjs`** — `lintNotes(entry): Violation[]`. Encodes the
  documented house style: each bullet starts with a capitalized past-tense
  verb, ends with `.`, contains no emoji, no em-dash, none of a
  banned-marketing-verb list (e.g. "seamlessly", "effortlessly",
  "revolutionary"), no exclamation marks. Returns structured violations so
  the skill can auto-fix the mechanical ones (missing period, em-dash→comma)
  and abort on the rest.

```ts
type Commit = { type: string; scope?: string; breaking: boolean; subject: string; hash: string };
type ReleaseEntry = { version: string; date: string; title: string; subtitle: string;
                      added?: string[]; changed?: string[]; fixed?: string[]; removed?: string[] };
type Violation = { field: string; index: number; rule: string; fixable: boolean };
```

### 2. `.claude/skills/release/SKILL.md` — orchestrator

Thin: shells out to git in both repos, calls the pure modules, polls the
live feed, fires the CI workflow. Replaces `/new-release`. Steps mirror the
LOCAL column above. Supports `--dry-run` (print computed version + drafted
entry + planned git operations; touch nothing) and an explicit version arg.
Hard preflight aborts: dirty tree, behind remote, red tests/tsc, missing
landing repo, computed version not greater than the last.

### 3. `.github/workflows/release.yml` (feedzero) — feedzero side

`workflow_dispatch` with a required `version` input. Steps 9–15 above.
Runs `npm test` + `tsc` before tagging; if either fails the job exits
before the tag is created (nothing half-shipped). After tagging it calls
the publish workflow.

### 4. `docker-publish.yml` — make reusable

Add `on: workflow_call` (with a `ref`/`version` input) alongside the
existing `push: tags: v*.*.*` trigger so both manual tags and `release.yml`
publish through one definition (no duplicated build logic).

## Version lock + guardrails

The four version touchpoints are chained so a mismatch is impossible to
ship:

1. **`package.json` `==` newest version in vendored `tests/fixtures/release-feed.xml`** — a new in-repo Vitest test (`release-version-sync.test.ts`). This is a purely in-repo check (no live cross-repo call). The fixture is refreshed from landing's `releases.xml` at release time (step 11), so it is the vendored stand-in for "what landing published"; keeping `package.json` equal to it transitively ties feedzero to the landing notes.
2. **git tag `==` `package.json`** — a guard step at the top of `docker-publish.yml` (and `release.yml`): `test "${TAG#v}" = "$(node -p 'require("./package.json").version')"`.

Transitively: landing notes (via the vendored fixture) == `package.json` == tag.

**Abort gates** (each precedes an irreversible action):
- Local: red `npm test`/`tsc`, dirty/behind tree, or no version increment → abort before touching landing.
- Local: landing feed not live within the poll timeout → abort before firing CI (feedzero never proceeds ahead of landing).
- CI: red `npm test`/`tsc` → abort before `git tag`.

## Failure handling, idempotency, recovery

- **Entry IDs preserved** (`feedzero:release:<version>`, `feedzero:changelog`) so re-runs never cause subscriber re-import storms — enforced by reusing `build-releases.mjs` unchanged.
- **Partial-failure resume:** if landing pushed but the feedzero CI failed, re-running `/release` detects the existing `releases.mjs` entry for the computed version and **skips to step 7** (poll) → step 8 (fire CI) rather than appending a duplicate entry.
- **CI is the slow, unattended half:** once the skill fires `release.yml` (step 8) the local machine is free; the multi-arch build finishes in CI.

## One-time setup (documented in the runbook)

- Allow GitHub Actions to push to `main` so `release.yml` can commit the
  bump + tag (Settings → Actions → Workflow permissions: read/write; or a
  ruleset bypass for the Actions app). **Fallback** if you'd rather not
  grant that: store a fine-scoped PAT (`contents: write`) as a secret,
  push the tag with it, and let the existing tag trigger publish — at the
  cost of managing a token.
- GHCR package already public (done). No `DOCKERHUB_*` unless Docker Hub
  mirroring is wanted.

## Testing strategy

- **Unit (Vitest), the bulk of the risk:** `compute-version` (every bump
  class + override), `draft-notes` (type→section mapping, prefix/scope
  stripping, title derivation), `lint-notes` (each rule, fixable vs fatal).
- **`--dry-run`** is the integration smoke for the skill: run it in the repo,
  assert it prints a plausible version + a lint-clean entry and performs no
  git writes.
- **Workflow:** `actionlint` on `release.yml` + the modified
  `docker-publish.yml`; the version-sync Vitest test guards the lock chain.
- No live end-to-end publish in CI (that's the real release); the
  `workflow_call` refactor is covered by actionlint + a manual dispatch dry
  run before first use.

## Out of scope (future)

- Auto-drafting the optional LinkedIn/bento social card.
- Auto-taking the landing screenshot (kept manual; orthogonal to versioning).
- A GitHub-UI-only trigger (the local skill is the entry point by design).
- `release-please`-style release PRs — the unattended local draft replaces
  that need.
