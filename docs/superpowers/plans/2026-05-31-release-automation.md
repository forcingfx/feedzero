# /release Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/release` command that, unattended, drafts curated landing release notes, publishes the landing changelog feed, then bumps/tags/publishes the feedzero Docker image — version-locked across all four touchpoints.

**Architecture:** Pure ESM logic modules (`scripts/release/*.mjs`) do version math, note drafting, and style linting (no git/network). A local Claude skill (`.claude/skills/release/`) orchestrates: it calls the pure modules, edits + pushes the landing repo, polls the live feed, then fires a feedzero CI workflow (`release.yml`) which bumps `package.json`, refreshes the vendored fixture from the live feed, runs tests, tags, and calls the reusable `docker-publish.yml`.

**Tech Stack:** Node ESM, Vitest, GitHub Actions (`workflow_call`), `gh` CLI, Caddy/Docker (existing).

**Working dir:** worktree `~/builder/feedzero-wt-release-auto`, branch `feat/release-automation`. Landing repo at `../feedzero-landing`. Run `tsc` with `npx -p typescript@6.0.3 tsc --noEmit` (local node_modules may be stale).

---

### Task 1: `compute-version.mjs` — semver from conventional commits

**Files:**
- Create: `scripts/release/compute-version.mjs`
- Test: `tests/scripts/release/compute-version.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseConventional, computeBump, nextVersion, computeVersion } from "../../../scripts/release/compute-version.mjs";

describe("parseConventional", () => {
  it("parses type, scope, breaking, description", () => {
    expect(parseConventional("feat(reader): add X")).toEqual({ type: "feat", scope: "reader", breaking: false, description: "add X" });
    expect(parseConventional("fix!: drop Y")).toEqual({ type: "fix", scope: null, breaking: true, description: "drop Y" });
  });
  it("flags BREAKING CHANGE in the subject", () => {
    expect(parseConventional("feat: z BREAKING CHANGE: w").breaking).toBe(true);
  });
  it("returns type null for non-conventional subjects", () => {
    expect(parseConventional("just words").type).toBeNull();
  });
});

describe("computeBump", () => {
  it("major on any breaking", () => expect(computeBump(["feat: a", "fix!: b"])).toBe("major"));
  it("minor on any feat (no breaking)", () => expect(computeBump(["fix: a", "feat: b"])).toBe("minor"));
  it("patch on fix/perf only", () => expect(computeBump(["fix: a", "perf: b"])).toBe("patch"));
  it("null when nothing releasable", () => expect(computeBump(["chore: a", "docs: b", "test: c"])).toBeNull());
});

describe("nextVersion / computeVersion", () => {
  it("bumps correctly", () => {
    expect(nextVersion("0.11.0", "major")).toBe("1.0.0");
    expect(nextVersion("0.11.0", "minor")).toBe("0.12.0");
    expect(nextVersion("0.11.3", "patch")).toBe("0.11.4");
    expect(nextVersion("0.11.0", null)).toBeNull();
  });
  it("computeVersion composes parse+bump+next", () => {
    expect(computeVersion("0.11.0", ["feat: a"])).toBe("0.12.0");
    expect(computeVersion("0.11.0", ["chore: a"])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/scripts/release/compute-version.test.ts`
Expected: FAIL — cannot find module `compute-version.mjs`.

- [ ] **Step 3: Implement**

```js
// scripts/release/compute-version.mjs
// Pure semver logic from conventional-commit subject lines. No I/O.
const RELEASE_BUMP = { feat: "minor", fix: "patch", perf: "patch" };

export function parseConventional(subject) {
  const m = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/s.exec(subject.trim());
  if (!m) return { type: null, scope: null, breaking: false, description: subject.trim() };
  const [, type, scope, bang, description] = m;
  return { type, scope: scope ?? null, breaking: Boolean(bang) || /BREAKING CHANGE/.test(subject), description: description.trim() };
}

export function computeBump(subjects) {
  let bump = null;
  for (const s of subjects) {
    const c = parseConventional(s);
    if (c.breaking) return "major";
    const b = RELEASE_BUMP[c.type];
    if (b === "minor") bump = "minor";
    else if (b === "patch" && bump !== "minor") bump = "patch";
  }
  return bump;
}

export function nextVersion(last, bump) {
  const [maj, min, pat] = last.split(".").map(Number);
  if (bump === "major") return `${maj + 1}.0.0`;
  if (bump === "minor") return `${maj}.${min + 1}.0`;
  if (bump === "patch") return `${maj}.${min}.${pat + 1}`;
  return null;
}

export function computeVersion(last, subjects) {
  return nextVersion(last, computeBump(subjects));
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run tests/scripts/release/compute-version.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/release/compute-version.mjs tests/scripts/release/compute-version.test.ts
git commit -m "feat(release): conventional-commit version computation"
```

---

### Task 2: `draft-notes.mjs` — commits → releases.mjs entry

**Files:**
- Create: `scripts/release/draft-notes.mjs`
- Test: `tests/scripts/release/draft-notes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { toHouseStyle, draftNotes } from "../../../scripts/release/draft-notes.mjs";

describe("toHouseStyle", () => {
  it("capitalizes, ensures terminal period, replaces em-dash, drops exclamation", () => {
    expect(toHouseStyle("added a thing — really!")).toBe("Added a thing, really.");
  });
  it("leaves backticks intact (build-releases turns them into <code>)", () => {
    expect(toHouseStyle("set `FOO`")).toBe("Set `FOO`.");
  });
});

describe("draftNotes", () => {
  it("buckets feat→added, fix→fixed, perf/refactor→changed; ignores chore/docs", () => {
    const entry = draftNotes(
      ["feat: add A", "fix: fix B", "perf: speed C", "chore: bump dep", "docs: tweak"],
      { version: "0.12.0", date: "2026-06-01T12:00:00Z" },
    );
    expect(entry.version).toBe("0.12.0");
    expect(entry.added).toEqual(["Add A."]);
    expect(entry.fixed).toEqual(["Fix B."]);
    expect(entry.changed).toEqual(["Speed C."]);
    expect(entry.title).toBe("Add A");
    expect(entry.subtitle).toBe("1 added, 1 changed, 1 fixed.");
  });
  it("omits empty sections and falls back to a maintenance title", () => {
    const entry = draftNotes(["refactor: tidy"], { version: "0.12.0", date: "2026-06-01T12:00:00Z" });
    expect(entry.added).toBeUndefined();
    expect(entry.changed).toEqual(["Tidy."]);
    expect(entry.title).toBe("Tidy");
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — `npx vitest run tests/scripts/release/draft-notes.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```js
// scripts/release/draft-notes.mjs
// Pure: conventional-commit subjects -> a releases.mjs entry object. No I/O.
import { parseConventional } from "./compute-version.mjs";

const SECTION_BY_TYPE = { feat: "added", fix: "fixed", perf: "changed", refactor: "changed" };

export function toHouseStyle(description) {
  let s = description.trim().replace(/\s*—\s*/g, ", ").replace(/!+/g, "");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.]$/.test(s)) s += ".";
  return s;
}

export function draftNotes(subjects, { version, date }) {
  const buckets = { added: [], changed: [], fixed: [] };
  for (const subj of subjects) {
    const section = SECTION_BY_TYPE[parseConventional(subj).type];
    if (!section) continue;
    buckets[section].push(toHouseStyle(parseConventional(subj).description));
  }
  const lead = buckets.added[0] ?? buckets.changed[0] ?? buckets.fixed[0] ?? "Maintenance release.";
  const counts = [];
  for (const k of ["added", "changed", "fixed"]) if (buckets[k].length) counts.push(`${buckets[k].length} ${k}`);
  const entry = { version, date, title: lead.replace(/\.$/, ""), subtitle: counts.join(", ") + "." };
  for (const k of ["added", "changed", "fixed"]) if (buckets[k].length) entry[k] = buckets[k];
  return entry;
}
```

- [ ] **Step 4: Run test, verify pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/release/draft-notes.mjs tests/scripts/release/draft-notes.test.ts
git commit -m "feat(release): draft release-notes entry from commits"
```

---

### Task 3: `lint-notes.mjs` — house-style gate

**Files:**
- Create: `scripts/release/lint-notes.mjs`
- Test: `tests/scripts/release/lint-notes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { lintBullet, lintNotes } from "../../../scripts/release/lint-notes.mjs";

describe("lintBullet", () => {
  it("passes a clean past-tense bullet", () => expect(lintBullet("Added a feature.")).toEqual([]));
  it("flags missing terminal period (fixable)", () =>
    expect(lintBullet("Added a feature")).toEqual([{ rule: "ends-with-period", fixable: true }]));
  it("flags lowercase start (fatal)", () =>
    expect(lintBullet("added a feature.")).toContainEqual({ rule: "capitalized-start", fixable: false }));
  it("flags marketing verbs and emoji (fatal)", () => {
    expect(lintBullet("Seamlessly improved sync.").some((v) => v.rule === "no-marketing-verb")).toBe(true);
    expect(lintBullet("Added sparkle ✨.").some((v) => v.rule === "no-emoji")).toBe(true);
  });
});

describe("lintNotes", () => {
  it("reports field + index for each violation", () => {
    const v = lintNotes({ added: ["Added a feature"], fixed: ["fixed a bug."] });
    expect(v).toContainEqual({ field: "added", index: 0, rule: "ends-with-period", fixable: true });
    expect(v).toContainEqual({ field: "fixed", index: 0, rule: "capitalized-start", fixable: false });
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — FAIL (module missing).

- [ ] **Step 3: Implement**

```js
// scripts/release/lint-notes.mjs
// Pure house-style checks for release-notes bullets. No I/O.
const BANNED = ["seamlessly", "effortlessly", "revolutionary", "game-chang", "blazing",
  "delightful", "magical", "cutting-edge", "best-in-class", "powerful"];
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;

export function lintBullet(text) {
  const v = [];
  if (!/^[A-Z]/.test(text)) v.push({ rule: "capitalized-start", fixable: false });
  if (!/[.]$/.test(text)) v.push({ rule: "ends-with-period", fixable: true });
  if (/—/.test(text)) v.push({ rule: "no-em-dash", fixable: true });
  if (/!/.test(text)) v.push({ rule: "no-exclamation", fixable: true });
  if (EMOJI.test(text)) v.push({ rule: "no-emoji", fixable: false });
  if (BANNED.some((w) => text.toLowerCase().includes(w))) v.push({ rule: "no-marketing-verb", fixable: false });
  return v;
}

export function lintNotes(entry) {
  const out = [];
  for (const field of ["added", "changed", "fixed", "removed"]) {
    (entry[field] ?? []).forEach((text, index) => {
      for (const v of lintBullet(text)) out.push({ field, index, ...v });
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test, verify pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/release/lint-notes.mjs tests/scripts/release/lint-notes.test.ts
git commit -m "feat(release): house-style lint for release notes"
```

---

### Task 4: Lock-chain guard test + refresh vendored fixture

**Files:**
- Modify: `tests/fixtures/release-feed.xml` (refresh to current release)
- Create: `tests/scripts/release-version-sync.test.ts`

- [ ] **Step 1: Refresh the vendored fixture from the live landing feed**

Run:
```bash
curl -fsSL https://feedzero.app/releases.xml -o tests/fixtures/release-feed.xml
grep -oE 'feedzero:release:[0-9.]+' tests/fixtures/release-feed.xml | head -1
```
Expected: `feedzero:release:0.11.0` (matches `package.json`). If it shows an older version, the landing site hasn't published 0.11.0 yet — stop and resolve that first.

- [ ] **Step 2: Write the failing test**

```ts
// tests/scripts/release-version-sync.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(__dirname, "../..");

describe("release version lock (#212/#211 drift guard)", () => {
  it("package.json version equals the newest vendored release-feed entry", () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO, "package.json"), "utf8")).version;
    const xml = readFileSync(path.join(REPO, "tests/fixtures/release-feed.xml"), "utf8");
    const newest = /<id>feedzero:release:([0-9][0-9.]*)<\/id>/.exec(xml)?.[1];
    expect(newest, "no release id in fixture").toBeTruthy();
    expect(newest).toBe(pkg);
  });
});
```

- [ ] **Step 3: Run test**

Run: `npx vitest run tests/scripts/release-version-sync.test.ts`
Expected: PASS (after Step 1 refresh). If FAIL, the fixture top ≠ `package.json` — re-run Step 1 or fix `package.json`.

- [ ] **Step 4: Confirm the existing parser contract test still passes**

Run: `npx vitest run tests/core/parser/release-feed-fixture.test.ts` → PASS (same Atom format).

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/release-feed.xml tests/scripts/release-version-sync.test.ts
git commit -m "test(release): lock package.json to the vendored release feed"
```

---

### Task 5: Make `docker-publish.yml` reusable + add tag-drift guard

**Files:**
- Modify: `.github/workflows/docker-publish.yml`

- [ ] **Step 1: Add `workflow_call` trigger with a `version` input**

Edit the `on:` block to:
```yaml
on:
  push:
    tags:
      - 'v*.*.*'
  workflow_dispatch:
  workflow_call:
    inputs:
      version:
        description: "Release version without leading v (e.g. 0.12.0). Set when called by release.yml."
        required: true
        type: string
```

- [ ] **Step 2: Add a drift-guard + tag-derivation step** as the FIRST step in the `build-and-push` job's `steps:` (right after `- name: Check out`):

```yaml
      - name: Resolve + verify release version
        id: ver
        run: |
          if [ "${{ github.event_name }}" = "workflow_call" ]; then
            VER="${{ inputs.version }}"
          else
            VER="${GITHUB_REF_NAME#v}"
          fi
          PKG="$(node -p "require('./package.json').version")"
          if [ "${{ github.event_name }}" != "workflow_dispatch" ] && [ "$VER" != "$PKG" ]; then
            echo "::error::version mismatch: ref/input=$VER package.json=$PKG"; exit 1
          fi
          echo "version=$VER" >> "$GITHUB_OUTPUT"
          echo "minor=${VER%.*}" >> "$GITHUB_OUTPUT"
```

- [ ] **Step 3: Replace the `tags:` list in the `Derive image metadata` step** so it works for both tag-push and workflow_call:

```yaml
          tags: |
            type=raw,value=v${{ steps.ver.outputs.version }},enable=${{ github.event_name != 'workflow_dispatch' }}
            type=raw,value=${{ steps.ver.outputs.minor }},enable=${{ github.event_name != 'workflow_dispatch' }}
            type=raw,value=latest,enable=${{ github.event_name != 'workflow_dispatch' }}
            type=sha,enable=${{ github.event_name == 'workflow_dispatch' }}
```

- [ ] **Step 4: Lint the workflow**

Run: `sg docker -c "docker run --rm -v $PWD:/repo --workdir /repo rhysd/actionlint:latest .github/workflows/docker-publish.yml; echo RC=\$?"`
Expected: `RC=0`, no output lines.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/docker-publish.yml
git commit -m "ci(release): make docker-publish reusable + version drift guard"
```

---

### Task 6: `release.yml` — feedzero bump/tag/publish

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Release feedzero
# Triggered by the local /release skill via `gh workflow run` AFTER the
# landing changelog feed is confirmed live. Bumps version, refreshes the
# vendored fixture from the live feed, verifies the version lock, tests,
# tags, and publishes the image via the reusable docker-publish workflow.
on:
  workflow_dispatch:
    inputs:
      version:
        description: "Release version without leading v (e.g. 0.12.0)"
        required: true
        type: string

permissions:
  contents: write
  packages: write

jobs:
  prepare:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          ref: main
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - name: Bump package.json
        run: npm version "${{ inputs.version }}" --no-git-tag-version
      - name: Refresh vendored fixture from the live landing feed
        run: curl -fsSL https://feedzero.app/releases.xml -o tests/fixtures/release-feed.xml
      - name: Verify version lock (package.json == feed top == input)
        run: |
          PKG="$(node -p "require('./package.json').version")"
          FEED="$(grep -oE 'feedzero:release:[0-9.]+' tests/fixtures/release-feed.xml | head -1 | cut -d: -f3)"
          test "$PKG" = "${{ inputs.version }}" || { echo "::error::package.json $PKG != input"; exit 1; }
          test "$FEED" = "${{ inputs.version }}" || { echo "::error::landing feed top $FEED != ${{ inputs.version }} (publish landing first)"; exit 1; }
      - run: npx tsc --noEmit
      - run: npm test
      - name: Commit bump + fixture and tag
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add package.json package-lock.json tests/fixtures/release-feed.xml
          git commit -m "release: v${{ inputs.version }}"
          git push origin main
          git tag "v${{ inputs.version }}"
          git push origin "v${{ inputs.version }}"
  publish:
    needs: prepare
    uses: ./.github/workflows/docker-publish.yml
    with:
      version: ${{ inputs.version }}
    secrets: inherit
```

- [ ] **Step 2: Lint**

Run: `sg docker -c "docker run --rm -v $PWD:/repo --workdir /repo rhysd/actionlint:latest .github/workflows/release.yml; echo RC=\$?"`
Expected: `RC=0`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): release.yml orchestrates bump/tag/publish"
```

---

### Task 7: `/release` skill (orchestrator) + retire `/new-release`

**Files:**
- Create: `.claude/skills/release/SKILL.md`
- Delete: `.claude/skills/new-release/SKILL.md` (superseded; buggy: never tagged, stale `/kindle/` paths)

- [ ] **Step 1: Write the skill**

````markdown
---
name: release
description: Cut a FeedZero release end-to-end and unattended — draft curated landing notes, publish the changelog feed (landing first), then trigger CI to bump, tag, and publish the Docker image. Version is auto-derived from conventional commits.
argument-hint: "[X.Y.Z to force a version] [--dry-run]"
---

# /release

Cut a release with one command. Supersedes the old `/new-release`.

## Inputs
- Optional explicit version `X.Y.Z` (else derived from conventional commits).
- `--dry-run`: compute + draft + lint and print everything; make NO writes.

## Preconditions (ABORT if any fail)
1. feedzero working tree clean, on `main`, up to date (`git fetch && git status`).
2. `npm test` and `npx -p typescript@6.0.3 tsc --noEmit` both green.
3. Landing repo present at `../feedzero-landing`, clean, on `main`.

## Steps

1. **Last version**: `node -e "import('../feedzero-landing/releases.mjs').then(m=>console.log(m.releases[0].version))"`.
2. **Commits since**: find the boundary — the commit that bumped to the last version (search `git log` for `release: v<last>` or tag `v<last>`), then `git log --pretty=%s <boundary>..HEAD`. Collect subject lines.
3. **Version**: import `scripts/release/compute-version.mjs`; `computeVersion(last, subjects)`. If `null` → ABORT "nothing to release". If an explicit arg was given, use it instead.
4. **Draft notes**: `draftNotes(subjects, { version, date: <now ISO> })` from `scripts/release/draft-notes.mjs`.
5. **Lint**: `lintNotes(entry)` from `scripts/release/lint-notes.mjs`. Auto-fix `fixable` violations (append period, em-dash→comma, strip `!`); if any non-fixable remain → ABORT and show them.
6. **--dry-run?** print version + entry + planned git ops and STOP here.
7. **Write landing**: prepend the entry object to the `releases` array in `../feedzero-landing/releases.mjs`, then `cd ../feedzero-landing && node build-releases.mjs`. Verify `releases.xml` first `<entry>` is the new version.
8. **Push landing FIRST**: `cd ../feedzero-landing && git add releases.mjs releases.xml index.html && git commit -m "release: v<version> — <title>" && git push origin main`.
9. **Wait for landing live**: poll `https://feedzero.app/releases.xml` (every 15s, up to ~5 min) until it contains `feedzero:release:<version>`. Timeout → ABORT (do NOT trigger feedzero).
10. **Trigger feedzero CI**: `gh workflow run release.yml --repo forcingfx/feedzero -f version=<version>`. Report the run URL.
11. **Report**: print the landing commit, the feed URL, and the CI run link. Done — the user can walk away; CI bumps/tags/publishes.

## Notes
- NEVER change existing `<id>` values (`feedzero:release:*`, `feedzero:changelog`) — breaks subscribers.
- Notes are editable after the fact: edit `releases.mjs`, re-run `build-releases.mjs`, push landing.
- **Resume after partial failure**: if `releases.mjs` already has an entry for `<version>`, skip steps 4–8 and resume at step 9.
- Screenshot/bento/LinkedIn are out of scope here — run those manually if wanted.
````

- [ ] **Step 2: Delete the superseded skill**

```bash
git rm -r .claude/skills/new-release
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/release/SKILL.md
git commit -m "feat(release): /release orchestrator skill; retire /new-release"
```

---

### Task 8: Setup runbook + full verification

**Files:**
- Modify: `docs/operations/self-host-image-publishing.md` (add a `/release` + setup section)

- [ ] **Step 1: Append a `## Automated releases (/release)` section** documenting:
  - The flow (local skill → landing-first → CI).
  - **One-time setup:** GitHub → Settings → Actions → General → Workflow permissions → **Read and write** (lets `release.yml` push the bump + tag). Fallback: a fine-scoped PAT (`contents: write`) stored as secret `RELEASE_TAG_TOKEN`, used by `release.yml`'s push step, if you prefer not to grant Actions write.
  - That the `v*` tag still publishes via the existing trigger for manual tags.

```bash
# (write the section, then:)
git add docs/operations/self-host-image-publishing.md
git commit -m "docs(release): document /release flow + one-time setup"
```

- [ ] **Step 2: Full suite + type check + lint**

Run:
```bash
npx vitest run                                  # expect 0 failures (incl. new release tests + lock guard)
npx -y -p typescript@6.0.3 tsc --noEmit -p tsconfig.json   # expect clean
sg docker -c "docker run --rm -v $PWD:/repo --workdir /repo rhysd/actionlint:latest .github/workflows/release.yml .github/workflows/docker-publish.yml; echo RC=\$?"  # RC=0
```

- [ ] **Step 3: Dry-run the skill end-to-end (no writes)**

Manually exercise the skill logic: run the three pure modules against `git log` of the last 20 commits and confirm it prints a plausible version + a lint-clean entry. (The skill's `--dry-run` path.)

- [ ] **Step 4: Push branch + open PR (do NOT merge)**

```bash
git push -u origin feat/release-automation
gh pr create --base main --head feat/release-automation --title "feat: /release one-command release automation" --body "Implements docs/superpowers/specs/2026-05-31-release-automation-design.md. Not auto-merging."
```

---

## Self-review notes (author)
- Spec coverage: compute-version (T1), draft-notes (T2), lint (T3), lock-chain (T4), reusable docker-publish + drift guard (T5), release.yml (T6), skill + retire new-release (T7), runbook/setup + verification (T8). All spec sections mapped.
- The CI fixture refresh in T6 uses the LIVE feed (curl), since `../feedzero-landing` is absent in CI — this also makes the lock-chain re-verify against what landing actually published (landing-first enforced).
- Types consistent: `parseConventional`→`computeBump`→`computeVersion`; `draftNotes` entry shape matches `releases.mjs`; `lintNotes` violation shape `{field,index,rule,fixable}` used in skill step 5.
