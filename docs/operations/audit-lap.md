# Quarterly architecture audit lap

Recurring 90-minute task. Runs the architecture-decay detectors and produces
a 3-finding memo. Not a substitute for code review — a safety net for the
*kind* of bug that ships because nobody was specifically *looking* for it
between releases.

This exists because four production incidents in one quarter
(2026-05-12 sync, 2026-05-14 stats, 2026-05-19 destroy cascade,
2026-05-28 onboarding modal) shared a pattern — implicit state, tests
that verify the implementation instead of the user, "two things each own
half the truth." The pattern is documented in
[ADR 025](../decisions/025-test-the-user-not-the-function.md);
this is the operational loop that catches the *next* instance before it ships.

**Cadence:** quarterly, on a calendar reminder. Adjust to monthly if a
release cycle bites. The memo goes in `docs/reports/audit-YYYY-QQ.md` and
gets linked from `docs/decisions/` if a finding warrants an ADR.

## Pass 1 — automated detectors (15 min)

Run the scripts. Capture the numbers; eyeball deltas vs the last lap.

```bash
# Test-suspicion (ADR 025) — surfaces the four-incident pattern.
scripts/audit-suspicious-tests.sh --count

# Codebase churn hotspots — the file changed most often is usually
# where the next bug lands. Per CLAUDE.md → "Auditing the codebase".
git log --since='3 months ago' --pretty=format: --name-only \
  | grep -v '^$' | sort | uniq -c | sort -rn | head -10

# Size outliers — a high-churn big file is the next refactor.
find src -name '*.ts' -o -name '*.tsx' | xargs wc -l | sort -rn | head -10

# Fix-to-commit ratio — > 25% is a smell. <15% is healthy.
total=$(git log --since='3 months ago' --pretty=format:'%s' | wc -l)
fixes=$(git log --since='3 months ago' --pretty=format:'%s' | grep -ciE '^(fix|hotfix|revert)')
echo "Fix ratio: $fixes / $total = $(echo "scale=2; $fixes * 100 / $total" | bc)%"

# Mock-the-collaborator detector — store tests mocking db.ts.
# CLAUDE.md names this the "three SEV incidents" shape.
grep -rln 'vi.mock.*"@/core/storage/db' tests/stores/

# Boundary-violation detector — core/stores must never import UI.
grep -rln 'from "@/components"' src/core src/stores
# Empty means clean. Any hit is a structural rule break.
```

If any of these scream — fix-ratio above 25%, a boundary violation, a
store test that should be an integration test — stop and act on it.
That's the lap doing its job.

## Pass 2 — structured eyeball (45 min)

Open each in a tab and skim:

1. **`docs/incidents/`** — the last 90 days. For each: was a test added
   that would now catch it? If not, that's a finding. If yes, does the
   test live where a reviewer would look (next to the incident's
   surface, not buried in a fixture)?

2. **Last 5 PRs that shipped a bug fix.** Read the commit body. Does
   the "Why" section name a root cause, or just a symptom? Symptoms
   without root cause = the next adjacent bug is already coded.

3. **The five-biggest source files** (from Pass 1).
   For each: is the file's growth justified by feature work, or is it
   the default landing zone for "I don't know where else to put this"?
   The latter is the next "split when the next investment is committed."

4. **The store ↔ store getState() graph.** Grep
   `grep -rn "use.*Store.getState" src/stores/`. The expected shape is
   a sparse triangle (feed ↔ article ↔ sync). Any new edges land as
   findings.

## Pass 3 — write the memo (30 min)

Three findings, ranked by "removes a class of bug × ease of fix."
Each one paragraph. Template:

```markdown
# Audit YYYY-QQ

Run on YYYY-MM-DD. Detector deltas vs last lap:
- A (toHaveBeenCalled): 526 → NNN
- B (impl-shaped names): 630 → NNN
- C (store tests mocking db): 2 → N
- D (dialog-not-visible): 0 → N
- E (E2E onboarding bypass): 4 → N
- Fix ratio: NN% (target: < 15%)

## Finding 1 — <one-line summary>

**Costs:** <what it makes harder; what bug class it enables>
**Buys:** <what fixing it removes / unblocks>
**Why now:** <what's queued that benefits from the fix>
**Sized:** small / medium / large

## Finding 2 — ...

## Finding 3 — ...

## Refused

<findings considered and rejected — the rejection is the discipline>
```

Anyone reading the memo six months later should be able to tell what
the next investment area was, what we deferred, and why. The audit lap
is only valuable if the memo gets *read* during the next planning
window. Land it in `docs/reports/` and link it from the next planning
issue.

## Rules of engagement

- **Refuse a finding if you can't answer two of:** "removes a class of
  bug? removes a class of confusion? unblocks future speed?" The
  refusal IS the discipline; this lap is not a wishlist.
- **Refuse to rewrite working low-churn modules.** A 900-line file with
  zero recent bugs and zero recent churn is not a target. Same file
  when three additions are queued = different question.
- **Ship one commit per finding.** Smallest-risk first so a surprise on
  the harder finding doesn't block the easier ones.
- **A finding has to be writable as a release-notes bullet a user would
  understand.** If it can't be, it's not the user's bug — it's
  housekeeping. Housekeeping is fine, but separate the two in the memo.

## When NOT to run the lap

- Mid-release-cut week. Land the release first.
- Right after a SEV. The post-mortem is the audit for that quarter.
- When the fix-ratio is already healthy (< 15%) and no detector spiked.
  Skipping a lap is fine if the system is steady; the cadence exists
  to catch decay, not to manufacture work.
