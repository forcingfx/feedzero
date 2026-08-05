# End-to-End Shipping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command takes a change from working tree to verified-live in under ten minutes, unattended, and a release becomes one PR in one repository.

**Architecture:** Logic lives in unit-tested `.mjs` modules; GitHub workflows are thin shims that call them. Deploy verification is exact rather than time-based: the health endpoint reports the deployed commit, so `/ship` polls until production serves the SHA it just merged. The release feed moves into feedzero while the public URL stays on the landing domain via a Vercel rewrite, so subscribers are unaffected.

**Tech Stack:** Node 22 ESM (`.mjs` + `.d.mts`), Vitest, GitHub Actions, Vercel, `gh` CLI.

## Global Constraints

- Node 22 in CI; `node scripts/*.mjs` must run with no build step and no dependencies outside Node built-ins.
- Scripts must NOT read `process.env` for runner variables — `scripts/` is scanned by `npm run check-env` against `expected-env.json`, the deployment contract. Pass runner values as argv; print `key=value` on stdout, narration on stderr.
- All 7 required checks remain required. Nothing in this plan weakens branch protection.
- Feed identifiers `feedzero:release:<version>` and `feedzero:changelog` must never change.
- The public feed URL `https://feedzero.app/releases.xml` must keep serving the same bytes throughout.
- Conventional commit prefixes; bug fixes need What / Why / Fix / Prevention.
- Every code change follows Red-Green-Refactor.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/core/health/health-handler.ts` (modify) | Add `commit` to the health body so deploys are identifiable. |
| `scripts/ship/verify-deploy.mjs` (create) | Pure: decide whether a health response proves the target commit is live. CLI: poll until it does. |
| `scripts/ship/verify-deploy.d.mts` (create) | Type surface. |
| `tests/scripts/ship/verify-deploy.test.ts` (create) | Unit tests for the pure decision. |
| `.claude/skills/ship/SKILL.md` (create) | The `/ship` procedure. |
| `.github/workflows/ci.yml` (modify) | Add an `actionlint` job. |
| `.github/workflows/release-rehearsal.yml` (create) | Nightly exercise of the release chain. |
| `release-notes.mjs` (create, feedzero) | Source of truth for release notes, moved from landing. |
| `scripts/release/build-feed.mjs` (create) | Pure: notes → Atom XML. CLI writes `public/releases.xml`. |
| `tests/scripts/release/build-feed.test.ts` (create) | Byte-compatibility tests against the current live feed. |
| `feedzero-landing/vercel.json` (modify) | Rewrite `/releases.xml` → `my.feedzero.app/releases.xml`. |

---

## Task 1: Health endpoint reports the deployed commit

**Files:**
- Modify: `src/core/health/health-handler.ts`
- Test: `tests/core/health/health-handler.test.ts`

**Interfaces:**
- Produces: health JSON gains `commit: string` (short SHA, or `"unknown"`).

- [ ] **Step 1: Write the failing test**

```ts
it("reports the deployed commit so a deploy can be identified", () => {
  process.env.VERCEL_GIT_COMMIT_SHA = "abc1234def5678";
  const body = JSON.parse(handleHealthRequest(new Request("http://x/")).body as never);
  expect(body.commit).toBe("abc1234");
});

it("falls back to unknown when no commit is injected", () => {
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  const res = handleHealthRequest(new Request("http://x/"));
  return res.json().then((b) => expect(b.commit).toBe("unknown"));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/health/health-handler.test.ts`
Expected: FAIL — `commit` is undefined.

- [ ] **Step 3: Implement**

Add to `HealthBody`: `commit: string`. Add:

```ts
/**
 * Short SHA of the deployed commit. Vercel injects
 * VERCEL_GIT_COMMIT_SHA at build; "unknown" keeps health a 200 when absent
 * (self-hosted images have no such variable).
 */
function resolveCommit(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return sha ? sha.slice(0, 7) : "unknown";
}
```

and include it in `currentBuildIdentity()`.

- [ ] **Step 4: Run tests, then `npm run check-env`**

`VERCEL_GIT_COMMIT_SHA` is platform-injected, so add it to `expected-env.json` with `required: "never"` semantics documented, or confirm the audit only scans `src`/`api`/`scripts` for `env.X` patterns it must document. Resolve whichever way keeps `check-env` green.

- [ ] **Step 5: Commit**

```bash
git add src/core/health tests/core/health expected-env.json
git commit -m "feat(health): report the deployed commit for exact deploy verification"
```

---

## Task 2: Deploy verification module

**Files:**
- Create: `scripts/ship/verify-deploy.mjs`, `scripts/ship/verify-deploy.d.mts`
- Test: `tests/scripts/ship/verify-deploy.test.ts`

**Interfaces:**
- Produces: `isDeployLive({ health, targetCommit })` → `{ live: boolean, reason: string }`.
- CLI: `node scripts/ship/verify-deploy.mjs <baseUrl> <targetCommit> [timeoutSeconds]`; exit 0 when live, 1 on timeout.

- [ ] **Step 1: Write the failing test**

```ts
describe("isDeployLive", () => {
  it("is live when health reports the target commit and ok", () => {
    expect(isDeployLive({ health: { ok: true, commit: "abc1234" }, targetCommit: "abc1234def" }).live).toBe(true);
  });
  it("is not live while an older commit is served", () => {
    expect(isDeployLive({ health: { ok: true, commit: "0000000" }, targetCommit: "abc1234def" }).live).toBe(false);
  });
  it("is not live when health reports not ok", () => {
    expect(isDeployLive({ health: { ok: false, commit: "abc1234" }, targetCommit: "abc1234" }).live).toBe(false);
  });
  it("is not live when the commit is unknown", () => {
    expect(isDeployLive({ health: { ok: true, commit: "unknown" }, targetCommit: "abc1234" }).live).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — module does not exist.

- [ ] **Step 3: Implement** the pure function (compare `targetCommit.startsWith(health.commit)` with `commit !== "unknown"` and `ok === true`), plus a CLI that polls `${baseUrl}/api/health` every 5s until live or timeout, printing progress to stderr.

- [ ] **Step 4: Run tests; verify CLI against production manually.**

- [ ] **Step 5: Commit**

---

## Task 3: The `/ship` skill

**Files:**
- Create: `.claude/skills/ship/SKILL.md`

- [ ] **Step 1: Write the skill** documenting the six phases: local gate, publish, CI, auto-merge, verify live via Task 2, report. Include exact commands, the worktree rule, and the abort conditions (dirty tree not authored by the agent, red local gate).

- [ ] **Step 2: Commit**

---

## Task 4: actionlint in CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a job** running `rhysd/actionlint` over `.github/workflows/`. It must fail on invalid YAML and undefined-context expressions.

- [ ] **Step 2: Verify it catches a known break** — temporarily reintroduce the `e2e.yml` dedent locally, confirm actionlint flags it, revert.

- [ ] **Step 3: Commit**

---

## Task 5: Nightly release rehearsal

**Files:**
- Create: `.github/workflows/release-rehearsal.yml`

- [ ] **Step 1: Implement** a scheduled workflow that calls `docker-publish.yml` in throwaway mode (no version input → sha tag only), asserting the resolver reports `release=false`, and runs `scripts/release/tag-decision.mjs` expecting the quiet no-op. Failure files an issue.

- [ ] **Step 2: Trigger once manually to prove it passes.**

- [ ] **Step 3: Commit**

---

## Task 6: Release notes move into feedzero

**Files:**
- Create: `release-notes.mjs`, `scripts/release/build-feed.mjs`, `scripts/release/build-feed.d.mts`
- Test: `tests/scripts/release/build-feed.test.ts`

**Interfaces:**
- Produces: `buildFeed(releases, { updated })` → Atom XML string.

- [ ] **Step 1: Write the failing test** asserting the generated feed for the existing release list is byte-identical to the current live `releases.xml` (fetched once and vendored as a fixture), and that ids are preserved.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Port `build-releases.mjs`'s generator** from landing, adjusted to emit into `public/releases.xml` so Vite copies it to `dist/`.

- [ ] **Step 4: Verify byte-identity, run the full suite.**

- [ ] **Step 5: Commit**

---

## Task 7: Serve the feed from feedzero and rewrite from landing

**Files:**
- Modify: `feedzero-landing/vercel.json`

- [ ] **Step 1: Ship feedzero's feed first.** Merge Task 6 and confirm `https://my.feedzero.app/releases.xml` serves bytes identical to `https://feedzero.app/releases.xml`.

- [ ] **Step 2: Add the rewrite** in landing:

```json
{ "rewrites": [{ "source": "/releases.xml", "destination": "https://my.feedzero.app/releases.xml" }] }
```

- [ ] **Step 3: Verify** `curl -sSL https://feedzero.app/releases.xml` still returns identical bytes and `Content-Type: application/atom+xml`, and that the app's auto-subscribe still resolves.

- [ ] **Step 4: Only then** delete landing's `releases.mjs`, `releases.xml`, `build-releases.mjs`, and repoint its accordion build at the live feed.

- [ ] **Step 5: Commit each step separately** so any of them can be reverted alone.

---

## Task 8: Simplify the release path

**Files:**
- Modify: `scripts/release/tag-decision.mjs`, `.claude/skills/release/SKILL.md`, `tests/scripts/release-version-sync.test.ts`

- [ ] **Step 1: Write the failing test** — version lock compares `package.json` to `release-notes.mjs`'s newest entry (same commit, no network).

- [ ] **Step 2: Implement**, dropping the live-feed fetch from `tag-decision.mjs`.

- [ ] **Step 3: Update the release skill** to a single-PR procedure.

- [ ] **Step 4: Run the full suite; commit.**

---

## Self-Review

- **Spec coverage:** Part 1 → Tasks 1–3. Part 2 → Tasks 6–8. Part 3 → Tasks 4–5. Merge-queue decision → no task (deliberately dormant).
- **Placeholders:** none; Task 1 Step 4 names a decision to resolve during execution rather than deferring work.
- **Type consistency:** `isDeployLive` and `buildFeed` signatures are used identically wherever referenced.
