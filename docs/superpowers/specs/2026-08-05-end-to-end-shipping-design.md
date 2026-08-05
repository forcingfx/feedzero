# End-to-end shipping: design

**Date:** 2026-08-05
**Status:** approved, pending implementation plan
**Goal:** one command takes a change from working tree to verified-live in
under ten minutes, unattended.

## Why

Cutting 0.13.0 took two calendar days. The cause was not slow infrastructure.
Measured from the repository:

| Phase | Wall clock |
|---|---|
| Full CI gauntlet (7 required checks, parallel) | ~2 min |
| PR #242 open → merged | 41 min |
| PRs #236 / #237 / #239 / #240 ready → merged | ~21 h |
| PR #252 open → merged | 3 h 25 min |
| Final stretch once unblocked (bump → tag → image) | ~6 min |

Two cost centres:

1. **Human gates.** The release needed roughly fourteen merge or dispatch
   actions, each a round trip to the operator.
2. **Latent broken automation.** Three workflow defects surfaced only when
   run for real, serially, on release day:
   - `release.yml` pushed the version bump straight to `main`. The ruleset
     forbids it (`GH013`), and the GitHub Actions app cannot be granted a
     bypass because `forcingfx` is a *user* account, not an organisation.
     The workflow could never have succeeded; it had simply never run.
   - `docker-publish.yml` selected its version with
     `if github.event_name == 'workflow_call'`. In a reusable workflow that
     is never true — `github.event_name` reports the *caller's* triggering
     event. The passed-in version was ignored.
   - The same idiom gated the release image tags, so the first successful
     publish pushed only a `sha-` tag, and no path existed to republish a
     release image once its git tag existed.
   - Separately, `e2e.yml` was invalid YAML, silently disabling post-merge
     E2E from the moment it merged.

The design attacks both: remove the gates, and make workflow defects surface
on an ordinary day rather than during a release.

## Part 1 — The ship loop

`/ship` runs the whole path unattended:

1. **Local gate** (~40 s): `npx tsc --noEmit` plus the tests covering the
   change. Failures cost nothing — nothing has left the machine.
2. **Publish**: branch, commit, push, open PR, arm auto-merge.
3. **CI** (~2 min): the existing seven required checks, unchanged.
4. **Merge → deploy**: auto-merge lands it; Vercel deploys production.
5. **Verify live**: poll the deployment to `Ready`, then assert against the
   real URL that the app boots and the changed behaviour is present.
6. **Report**: what shipped, where it is live.

Budget: ~5 minutes.

**Ship authority.** Steps 4–6 only run unattended because
`.claude/settings.local.json` now carries hard `permissions.allow` rules for
`Bash(gh pr merge:*)` and `Bash(gh workflow run:*)`. The natural-language
`autoMode.allow` entries added earlier are advisory and were overruled by the
permission classifier on every attempt.

This removes *waiting*, not *verification*: branch protection still requires
all seven checks, and the agent cannot bypass them.

**No merge queue.** The `merge_group` triggers and `merge-queue-smoke.yml`
from #246 stay dormant (they fire only on merge-queue refs, which will not
occur). A queue re-runs checks on the queue ref, adding ~2 minutes per PR to
buy protection against a failure mode — two independently-green PRs breaking
`main` together — that is rare at one-PR-at-a-time cadence. Plain auto-merge
is faster. The wiring is retained, tested, and can be enabled later by adding
the rule to ruleset 16445501 if PR volume rises.

## Part 2 — Releases collapse to one PR

### The constraint

The Atom feed is served at `https://feedzero.app/releases.xml` (the landing
domain) and the app auto-subscribes to that exact URL. Entry identifiers
(`feedzero:release:<version>`) and the feed id (`feedzero:changelog`) must
never change, or every subscriber re-imports every entry as new. **The public
URL cannot move.**

### The change

- **feedzero owns the notes.** `releases.mjs` moves from the landing repo
  into feedzero; the build emits `dist/releases.xml`, served from
  `my.feedzero.app`.
- **landing keeps the URL.** A Vercel *rewrite* maps
  `feedzero.app/releases.xml` → `my.feedzero.app/releases.xml`. A rewrite
  proxies rather than redirects, so subscribers see the same URL, the same
  ids, and the same bytes.
- **A release is one PR in one repo**: the notes entry and the version bump
  land in the same commit. Merge → Vercel deploys (feed live) →
  `release-tag.yml` tags and publishes the image.

### What this deletes

- The landing-first ordering invariant.
- Polling `releases.xml` for the new version.
- The release preflight job (#246) that guarded that ordering.
- Refreshing the vendored `tests/fixtures/release-feed.xml` from a live HTTP
  fetch during the release.
- The version-lock test's dependency on the network: it compares two files in
  the same commit, so the two cannot desync.
- The live-feed cross-check in `scripts/release/tag-decision.mjs`, which
  becomes a comparison against the in-repo notes.

Roughly half of the failure modes stop existing rather than being guarded.

### Landing after the change

Landing renders its release accordion by fetching the feed at build time. That
is a build-time read of a public URL, not an ordering constraint: landing can
deploy at any time, and a fetch failure falls back to the last committed
render.

### Migration order (must not be reordered)

1. feedzero gains the notes source and emits `dist/releases.xml`. Verify the
   deployed `my.feedzero.app/releases.xml` is byte-identical to the current
   landing feed.
2. landing adds the rewrite. Verify `feedzero.app/releases.xml` still serves
   identical bytes, and that a real feed reader shows no new entries.
3. Only then delete landing's `releases.mjs`, `releases.xml`, and
   `build-releases.mjs`.

Step 3 before step 2 would break every subscriber's feed.

## Part 3 — CI for CI

- **actionlint on every PR.** Seconds to run; catches invalid YAML and bad
  expressions. Would have caught the `e2e.yml` break.
- **Nightly release rehearsal.** Runs the real release chain against a
  scratch version, publishing to a throwaway image tag, then cleaning up.
  Would have caught both `github.event_name` defects on an ordinary day.
- The `GH013` class is gone by construction: nothing pushes to `main`.

## Testing

Logic keeps moving out of bash-inside-YAML into `.mjs` modules with unit
tests, the pattern established this session by `scripts/audit-gate.mjs`,
`scripts/release/tag-decision.mjs`, and `scripts/resolve-image-version.mjs`.
YAML is not unit-testable and hides defects until production; a tested module
plus a thin workflow shim is.

New logic under this design (deploy-readiness polling, live verification,
notes generation) follows the same shape: pure functions, unit tests written
first, a CLI entry point that prints `key=value` on stdout and narrates on
stderr, and no `process.env` reads (which would pull runner variables into
`expected-env.json`, the deployment contract).

## Error handling

- `/ship` fails fast and loud at the local gate; nothing is pushed.
- A red required check leaves the PR open with auto-merge armed; it lands if
  a later push turns it green, and never lands red.
- Live verification failure after merge reports loudly and links the
  deployment. It does not auto-revert: reverting a deploy is a judgement call
  about user impact, and the operator makes it.
- The release path stays idempotent: an already-tagged version is a quiet
  no-op, a version mismatch is a hard failure.

## Success criteria

1. A routine change reaches verified production in under ten minutes with no
   operator interaction beyond the initial request.
2. A release is one PR in one repository.
3. A workflow defect introduced today is detected before the next release,
   not during it.
4. Branch protection is unchanged: seven required checks still gate every
   merge, including release commits.
