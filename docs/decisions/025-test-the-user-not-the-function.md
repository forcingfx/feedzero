# ADR 025: Test the user, not the function

## Status

Accepted, 2026-05-28.

## Context

Four production incidents in six months have shared one root pattern:
*the test suite was green when the bug shipped, and the bug was actively
asserted as a feature by at least one test.*

| Date       | Incident                             | The test that enshrined the bug                                                          |
| ---------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| 2026-05-12 | Sync regression                      | Adapter resolver test asserted that the *configured* adapter was returned, not that the *correct* adapter was returned in production. |
| 2026-05-14 | Stats always zero                    | Stats handler test asserted `mockStorage.get` was called — which it was, against a per-cold-start in-memory `Map`. |
| 2026-05-19 | Destroy cascade                      | `expect(destroy).toHaveBeenCalled()` — destroy *was* called; that was the bug.          |
| 2026-05-28 | Onboarding modal never appeared      | E2E `expect(dialog).toBeHidden()` on first launch, plus `expect(state.hasCompletedOnboarding).toBe(true)` after `startNewUserOnboarding()`. |

The 4-incident class is no longer plausibly random. The root cause is
how we write tests, not the code under test.

## What goes wrong

Tests written *while implementing* a feature naturally describe what
the implementation does:

```ts
it("completes the full sequence on a healthy environment", async () => {
  await useAppStore.getState().startNewUserOnboarding();
  expect(initFresh).toHaveBeenCalled();
  expect(state.isDbReady).toBe(true);
  expect(state.hasCompletedOnboarding).toBe(true);
});
```

Every assertion is verifiable; every assertion describes a real
side-effect; the test is *correct*. And it's also a description of the
bug. The user's question — *"when I open the app the first time, do
I see the welcome screen?"* — is not asked anywhere, because the
implementation doesn't reach for that concept.

Once such a test is green, it acts as a *defender* of the broken
behavior in code review: any PR that breaks the auto-init path will
trip the test, and the reviewer is more likely to "fix" the PR than
to question the test.

## Decision

Three rules. All apply at code-review time; the first two also
apply to PR-template prompts going forward.

### Rule 1 — every user-facing feature gets at least one user-shaped test

A user-shaped test passes the *release-notes sniff*: if you wrote the
test name as a bullet in release notes, would a user understand what
changed?

```
GOOD: "a first-launch user sees the welcome step"
GOOD: "after refreshAll, new articles appear in the open list"
GOOD: "the sync badge shows 'Syncing…' while feeds are refreshing"

BAD:  "completes the full sequence"
BAD:  "calls initFresh"
BAD:  "sets isDbReady to true"
```

For features with substantial UI, the user-shaped test renders the
component tree (or the whole `<App />`) and asserts on what the user
would see — visible text, ARIA roles, URL — not on store state or
function-call counts.

### Rule 2 — `.toHaveBeenCalled` requires justification

When an assertion is `expect(thing).toHaveBeenCalled()`, the test
author owes the reviewer one of:

- A code comment naming the contract it's defending ("contract test
  at the network boundary — confirms `pushVault` was called with the
  vault id the resolver returned"), OR
- A user-shaped sibling test that exercises the same flow and would
  also fail if the call regressed.

Without one of those, `.toHaveBeenCalled` is asserting "the code did
what the code does", which can verify a bug as a feature.

This rule does not forbid the pattern — it bounds it. Contract tests
at the network/disk/clock boundary remain legitimate and required.

### Rule 3 — every feature with a "user explicitly does X" gate gets one E2E that does NOT bypass

Onboarding, login, paywall acceptance, destructive confirmations.
If the gate exists to make the user pause, at least one E2E must
walk through it. The `feedPage` fixture's `skipOnboarding` is the
correct shortcut for *every other* test — the audit question is
"does at least one spec exercise the non-bypassed path?"

## Consequences

### Adopted

- `scripts/audit-suspicious-tests.sh` produces a numbered report for
  each category (`toHaveBeenCalled` count, implementation-shaped test
  names, store tests mocking `db.ts`, dialog-not-visible assertions,
  E2E bypass sites). Run as part of the quarterly architecture audit
  lap.
- `tests/integration/onboarding-visibility.test.tsx` and
  `tests/e2e/onboarding.spec.ts` exemplify the user-shaped pattern
  for the onboarding flow.
- The PR template will gain a checkbox: *"Does my PR include at
  least one test whose name passes the release-notes sniff?"*

### Accepted trade-offs

- The audit script produces hundreds of `toHaveBeenCalled` matches.
  Triaging them by hand is the point — the noise IS the signal that
  the rule isn't internalized yet. Over time the count drops as the
  pattern shifts; the script's value is the trend across audit laps.
- User-shaped tests are slower than unit tests (they mount component
  trees) and noisier under refactor. We accept the cost. The bug
  class they catch was costly enough to justify it four times over.

### Anti-goals

- We do NOT delete `.toHaveBeenCalled` assertions wholesale. They are
  load-bearing at the boundary (`tests/integration/feed-store-db.test.ts`,
  routing contract tests in `server.test.ts`). The rule is "justify or
  pair with user-shaped", not "remove."
- We do NOT enforce the rules via CI. The audit lap is the enforcement
  loop. A CI gate would either be too noisy (every change fights
  Category B) or too lax to catch the next instance.

## References

- CLAUDE.md → *Testing*, *Mock at the boundary, not at the collaborator*
- 2026-05-19 incident: docs/incidents/2026-05-19-destroy-cascade.md
  ("the destroy cascade had a test that asserted destroy was called —
  verifying the bug as a feature")
- 2026-05-28 incident: this commit's parent thread; the fix is in
  `a27397d` and the integration regression-lock is in
  `tests/integration/onboarding-visibility.test.tsx`
