# Rollback + production monitoring — follow-up plan

Parked work-stream after the 2026-05-23 prod-bundle boot crash. The
immediate fix shipped in PR #180; the prevention bundle (postmortem,
smoke boot test, dynamic-import cleanup, build-warning-as-error) is
PR #184. This document captures the **next** layer — faster rollback
and earlier detection — so it can be picked up cold without
re-investigating the trade space.

Constraints that shape everything below:

- **Privacy first.** No Sentry, no Datadog, no RUM, no analytics
  that sees per-user state. Anything that observes the prod app
  must either be synthetic (operator-driven probes, not user-side
  callbacks) or strictly aggregate (counts, never request bodies).
- **Single operator.** No on-call rotation; the operator is one
  person who already reads GitHub Issues. New monitoring should
  open issues, not page Slack channels that nobody listens to.
- **Vercel is the deploy substrate.** Rollbacks go through Vercel,
  not git revert (which would force a rebuild and re-bundle —
  exactly the failure surface we're trying to defend).

## Rollback faster

### R1. One-click Vercel revert as a workflow_dispatch job — RECOMMENDED

Add `.github/workflows/rollback.yml`:

```yaml
name: Rollback production
on:
  workflow_dispatch:
    inputs:
      reason:
        description: "One-line reason (logged in the deployment)"
        required: true

permissions:
  contents: read

jobs:
  rollback:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Promote previous deployment
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT: ${{ secrets.VERCEL_PROJECT_ID }}
        run: |
          npx vercel@latest rollback \
            --token "$VERCEL_TOKEN" \
            --scope "$VERCEL_ORG" \
            --yes
          echo "Rolled back: ${{ inputs.reason }}"
```

Triggered manually from the GitHub Actions tab. End-to-end ~10
seconds vs. the current "open Vercel dashboard, find previous
deploy, click Promote" three-minute path.

**Prereqs:**
- Create a Vercel access token with `deployments:write` scope at
  https://vercel.com/account/tokens.
- Store as repo secret `VERCEL_TOKEN`.
- Also store `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID` (visible in the
  Vercel project's General settings).
- Rotation: quarterly. Track in `docs/operations/next-steps.md`.

**Trade:** one more credential in the secret store. Worth it — the
alternative is "minutes of dashboard hunting while users see the
broken bundle."

### R2. Branch protection requires the smoke boot test

PR #184 adds `tests/smoke/boot.test.ts` (headless chromium against
`SMOKE_BASE_URL`). It's gated by `SMOKE_TESTS=1` and currently
runs only post-deploy via `preview-smoke.yml`. To make it a true
gate, the post-deploy workflow's success status needs to be a
**required check** on the `main` branch protection rule.

**Action:** open GitHub repo settings → Branches → main → require
status check `preview-smoke / smoke`. The smoke step exits
non-zero if the boot screen shows "Failed to initialize," which
makes Vercel block the promotion automatically.

**Trade:** post-deploy smoke means the bundle reaches the preview
URL before failing. For a single-operator privacy product without
real RUM, that's an acceptable position — preview URLs aren't
indexed and the smoke runs within seconds of deploy.

## Monitor better (privacy-respecting)

### M1. Synthetic boot probe every 5 min via Actions cron — RECOMMENDED

Add `.github/workflows/synthetic-boot.yml`:

```yaml
name: Synthetic boot probe
on:
  schedule:
    - cron: "*/5 * * * *"   # every 5 minutes
  workflow_dispatch:

permissions:
  contents: read
  issues: write             # open/update incident issue on failure

jobs:
  probe:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Run boot smoke
        env:
          SMOKE_TESTS: "1"
          SMOKE_BASE_URL: https://my.feedzero.app
        run: npx vitest run tests/smoke/boot.test.ts
      - name: Open / update incident issue on failure
        if: failure()
        uses: actions/github-script@v8
        with:
          script: |
            const title = "incident/synthetic-fail: boot probe failing";
            const body = `Synthetic boot probe failed at ${new Date().toISOString()}.\nRun: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
            // find existing open issue with the label, comment if found; otherwise open
            const issues = await github.rest.issues.listForRepo({
              ...context.repo, state: "open", labels: "incident/synthetic-fail",
            });
            if (issues.data[0]) {
              await github.rest.issues.createComment({ ...context.repo, issue_number: issues.data[0].number, body });
            } else {
              await github.rest.issues.create({ ...context.repo, title, body, labels: ["incident/synthetic-fail"] });
            }
```

**What it catches:** every "user opens prod and sees the failure
screen" scenario, within 5 minutes. The 2026-05-23 incident
(SEV1, only signal was a screenshot from an iPhone two hours
later) would have generated an issue at minute 5 of the deploy.

**Cost:** ~280 runner-minutes/day (`288 runs × 1 min` average). Free
under the standard GitHub Actions allotment for a private repo
the size of feedzero, but watch the quota — bump the cron to
`*/10` if it ever bites.

**Privacy:** the probe is operator-side; FeedZero's prod backend
sees a `vercel-bot`-style UA hitting `/feeds`, nothing user-shaped.

**Auto-close:** add a companion job that re-runs after the issue
opens and `closes()` it when the probe goes green again. Drafted
above implicitly (each run that succeeds doesn't comment;
add an explicit "close on success after open issue exists" step
when implementing).

### M2. Enrich `/api/health` with deploy SHA + build timestamp

Currently returns `{ok: true, time}`. Add `{sha, builtAt}` derived
from Vercel's env vars (`VERCEL_GIT_COMMIT_SHA`,
`VERCEL_BUILD_TIME` if available) or a build-time `define`. The
synthetic probe (M1) then asserts:
- `sha` matches the expected `git rev-parse HEAD` on main
- `builtAt` is fresher than $threshold

Catches "deploy pipeline silently stuck on an old SHA" — a class
of failure no boot test will find because the boot test only
verifies *some* SHA is alive.

**Privacy:** the SHA is already public on GitHub; surfacing it on
`/api/health` doesn't leak anything.

**Implementation sketch:**
- `vite.config.js` injects `__BUILD_SHA__` + `__BUILD_TIME__` as
  `define` constants from `process.env.VERCEL_GIT_COMMIT_SHA` and
  `Date.now()`.
- `api/health.ts` returns them in the JSON body.
- Update `tests/smoke/health-version.test.ts` to assert the new
  fields.

### M3. Per-deploy chunk-hash diff in CI — most strategic, biggest build

**The upstream prevention layer above the boot smoke test.** Would
have stopped 2026-05-23 in the PR that introduced it, before any
deploy.

Concept: after each `npm run build` in CI, log the resulting asset
filenames + sizes (Vite already prints them). Store the list as a
build artifact. The next PR's build can diff against `main`'s
last-green build and flag:

- **App-store moved chunk** → `WARN: app-store.ts was in
  app-store-*.js, now in index-*.js`. (This is exactly the signal
  that would have warned us 2026-05-23.)
- **New chunk appeared** → fine, informational.
- **A specific in-tree module became dynamic-import-fed-into-static**
  → already covered by the `INEFFECTIVE_DYNAMIC_IMPORT` build gate
  from PR #184; M3 is the broader heuristic.

**Why not done now:** needs a baseline-storage strategy
(artifact-per-main-build? Git LFS? S3?), a comparison heuristic
that doesn't false-positive on every legitimate split, and a triage
flow (mark a chunk shift as "expected" in the PR description). Each
of those is its own micro-design; deferring to a separate ADR + PR.

**ADR title when picked up:** "ADR 021 — Per-build chunk topology
snapshot and PR-time diff." Should reference the 2026-05-23
postmortem as motivating context.

### M4. Aggregate-only error counts — REQUIRES ADR

If telemetry ever becomes worth the cost: a `/api/errors`
endpoint accepting `{kind, sha}` (no IP, no UA, no timestamps —
the server tags those itself with hour-resolution buckets, no
per-request retention). Counts only.

**The 2026-05-23 incident is the canonical case for justifying this
minimal signal** — every fresh visitor crashed for hours and the
only signal that reached us was a user screenshot. Even
hour-bucketed counts of `kind: "boot-failure"` from sha=X would
have screamed.

**But it crosses the privacy line drawn in
[`docs/strategy/003-playing-to-win.md`](../strategy/003-playing-to-win.md):**
"No telemetry, no analytics, no external calls except explicit user
actions." Document the trade explicitly in a new ADR before
adding. The trade is real; the answer is not obvious.

**ADR title when picked up:** "ADR 022 — Aggregate error counts vs.
the no-telemetry stance." Land the privacy framing and the
proposed endpoint shape together; ship code only after the ADR.

## Recommended pick-up order

When you next have half a day for this:

1. **R1** (rollback workflow) — 30 min. Closes the "how fast can we
   undo" gap. Zero new code paths in the app itself.
2. **M1** (synthetic boot probe) — 1 hr. Closes the "how do we know
   prod is broken" gap. Reuses the smoke test from PR #184.
3. **M2** (health-SHA enrichment) — 1 hr. Closes the "stale deploy"
   gap that M1 alone can't detect.

R2 (branch protection) is a setting toggle, not work — flip it
whenever you remember.

M3 + M4 are bigger; queue as ADR-bound work, not free-time fixes.

## Cross-references

- Postmortem: [`docs/incidents/2026-05-23-prod-bundle-boot-crash.md`](../incidents/2026-05-23-prod-bundle-boot-crash.md)
- PR #180 — immediate fix (merged).
- PR #184 — prevention bundle (postmortem, smoke boot test,
  dynamic-import cleanup, build gate, CI checkout pin).
- Other "unit-green but system-wrong" incidents:
  [`2026-05-12-sync-regression.md`](../incidents/2026-05-12-sync-regression.md),
  [`2026-05-14-stats-always-zero.md`](../incidents/2026-05-14-stats-always-zero.md),
  [`2026-05-19-sync-cascade.md`](../incidents/2026-05-19-sync-cascade.md).
- Strategy stance on telemetry:
  [`docs/strategy/003-playing-to-win.md`](../strategy/003-playing-to-win.md)
  §1 (Winning Aspiration) and §3 (How to Win).
