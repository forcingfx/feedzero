#!/usr/bin/env bash
# Audit script — flags test patterns that historically encoded bugs as
# features. Not a hard fail: produces a numbered report for human review.
#
# Background: four production incidents (2026-05-12 sync, 2026-05-14
# stats, 2026-05-19 destroy cascade, 2026-05-28 onboarding-modal)
# shipped despite a green suite because the tests asserted *that the
# implementation did what it was written to do*, not *that the user
# got what they needed*. Each fix had to start by deleting a test
# that "verified the bug as a feature."
#
# This script grep-and-flags the patterns most associated with that
# class. False positives are normal — the goal is "10 things worth
# 5 min of review", not "exactly N bugs found."
#
# Usage:
#   scripts/audit-suspicious-tests.sh           # full report
#   scripts/audit-suspicious-tests.sh --count   # just numbers per category
#
# Run as part of the quarterly architecture audit lap.

set -uo pipefail
# Note: NOT using -e because grep returns nonzero when it finds nothing,
# and "found nothing" is a legitimate result for each category.

cd "$(dirname "$0")/.."

COUNT_ONLY=false
if [[ "${1:-}" == "--count" ]]; then
  COUNT_ONLY=true
fi

# Category A — "function X was called" assertions on internal
# collaborators. These can verify the implementation did its own thing
# while the user-observable outcome is broken. The 2026-05-19 destroy
# cascade was: `expect(destroy).toHaveBeenCalled()` with the bug being
# that destroy SHOULDN'T have been called.
#
# Legitimate uses: contract tests at the network/disk/clock boundary
# (proxyFetch, storage adapters, sync push). Reviewer's job to
# triage.
echo "=== Category A: '.toHaveBeenCalled()' assertions ==="
echo "(triage: contract tests at the network/disk boundary OK; everything else is suspect)"
echo
A_HITS=$(grep -rn "toHaveBeenCalled" tests/ 2>/dev/null | grep -v ".snap" | wc -l | tr -d ' ')
echo "Total: $A_HITS occurrences"
if [[ "$COUNT_ONLY" != "true" ]]; then
  grep -rn "toHaveBeenCalled" tests/ 2>/dev/null | grep -v ".snap" | head -20
  echo "..."
fi
echo

# Category B — tests whose name describes the implementation, not the
# user. "completes the full sequence", "calls X", "sets Y" are
# implementation-shaped. "user sees Z", "pressing key K does L",
# "after refresh the list shows N items" are user-shaped.
echo "=== Category B: implementation-shaped test names ==="
echo "(triage: a name that wouldn't fit in a release-notes 'we fixed X' line is suspect)"
echo
B_HITS=$(grep -rEn 'it\(["`'"'"']\s*(completes|sets|calls|updates|returns|invokes|fires|dispatches|persists|writes|reads)\b' tests/ 2>/dev/null | grep -v ".snap" | wc -l | tr -d ' ')
echo "Total: $B_HITS occurrences"
if [[ "$COUNT_ONLY" != "true" ]]; then
  grep -rEn 'it\(["`'"'"']\s*(completes|sets|calls|updates|returns|invokes|fires|dispatches|persists|writes|reads)\b' tests/ 2>/dev/null | grep -v ".snap" | head -10
  echo "..."
fi
echo

# Category C — store tests that mock the DB layer and then assert
# state through the store, rather than reading through the real DB.
# CLAUDE.md names this exactly: "Mock at the boundary, not at the
# collaborator." Three incidents tracked back to this shape.
echo "=== Category C: store tests mocking db.ts ==="
echo "(triage: these can mock-loop — the contract drifts silently if not also covered by integration tests)"
echo
C_HITS=$(grep -rln 'vi.mock.*"@/core/storage/db' tests/stores/ 2>/dev/null | wc -l | tr -d ' ')
echo "Total: $C_HITS store test files mock db.ts"
if [[ "$COUNT_ONLY" != "true" ]]; then
  grep -rln 'vi.mock.*"@/core/storage/db' tests/stores/ 2>/dev/null
fi
echo

# Category D — assertions that the modal/dialog is NOT visible
# without a precondition that explains why. The 2026-05-28
# onboarding-modal incident shipped because E2E tests asserted
# `expect(dialog).toBeHidden()` on a fresh browser — which only
# passed because the auto-onboarding bug suppressed the modal.
echo "=== Category D: 'not visible' assertions on dialogs/modals ==="
echo "(triage: each one should be defending a specific dismissal path. Bare 'should not appear' on first launch is suspect.)"
echo
D_HITS=$(grep -rEn '(toBeHidden|not\.toBeVisible|not\.toBeInTheDocument).*(dialog|modal|onboarding|welcome)' tests/ 2>/dev/null | grep -v ".snap" | wc -l | tr -d ' ')
echo "Total: $D_HITS occurrences"
if [[ "$COUNT_ONLY" != "true" ]]; then
  grep -rEn '(toBeHidden|not\.toBeVisible|not\.toBeInTheDocument).*(dialog|modal|onboarding|welcome)' tests/ 2>/dev/null | grep -v ".snap" | head -10
fi
echo

# Category E — auto-bypass calls in E2E (the kind that hid the
# onboarding bug). These are LEGITIMATE for most tests; the audit
# question is "is there at least ONE E2E that doesn't bypass this?"
echo "=== Category E: E2E flows that bypass onboarding via localStorage ==="
echo "(triage: at least one E2E spec MUST exercise the non-bypassed path. tests/e2e/onboarding.spec.ts is it.)"
echo
E_HITS=$(grep -rEn 'feedzero:onboarding-complete.*true' tests/e2e/ 2>/dev/null | wc -l | tr -d ' ')
echo "Total: $E_HITS bypass sites"
if [[ "$COUNT_ONLY" != "true" ]]; then
  echo "Reverse check — specs that do NOT bypass:"
  for f in tests/e2e/*.spec.ts; do
    if ! grep -q "onboarding-complete.*true" "$f" 2>/dev/null && ! grep -q "from.*fixtures" "$f" 2>/dev/null; then
      echo "  $f"
    fi
  done
fi
echo

echo "=== Summary ==="
echo "A (toHaveBeenCalled):           $A_HITS"
echo "B (implementation-shaped names): $B_HITS"
echo "C (store tests mocking db.ts):  $C_HITS"
echo "D (not-visible on dialogs):     $D_HITS"
echo "E (E2E onboarding bypasses):    $E_HITS"
echo
echo "Review categories with the lens: 'could a real user-facing bug ship while every test in this category stays green?'"
echo "Document accepted false positives in docs/decisions/0XX-test-the-user-not-the-function.md."
