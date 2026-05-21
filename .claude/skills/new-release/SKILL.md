---
name: new-release
description: Cut a new FeedZero release — write release notes, regenerate the Atom feed, bump the version, update the test fixture, optionally create a bento page, and push both repos in deployment order.
argument-hint: "<version> e.g. 0.6.0"
---

# New Release

Cut a new FeedZero release. This skill codifies the exact process so every release is consistent and nothing is forgotten.

## Arguments

`$ARGUMENTS` is the new version number (e.g. `0.6.0`). If omitted, ask the user.

## Prerequisites

Before starting, verify:
1. All tests pass: `npm test` in the feedzero repo.
2. Working tree is clean (no uncommitted changes that should be in this release).
3. The landing repo at `../feedzero-landing/` is accessible and on `main`.

## Step-by-step process

### 1. Determine what changed

```bash
# Find the previous release version
cd ../feedzero-landing && node -e "import('./releases.mjs').then(m => console.log(m.releases[0].version))"
```

Then in the feedzero repo, get the git log since the last release was cut. Cross-reference with `../feedzero-landing/releases.mjs` to find the boundary commit.

```bash
cd /home/DeadEye3164/builder/kindle/feedzero
git log --oneline <last-release-commit>..HEAD
```

Categorize commits into Added / Changed / Fixed / Removed per Keep-a-Changelog convention. Skip merge commits, test-only commits, and docs-only commits unless they're user-facing.

### 2. Write the release entry

Edit `../feedzero-landing/releases.mjs`. Add a new object at the TOP of the `releases` array:

```js
{
  version: "<VERSION>",
  date: "<TODAY ISO 8601, e.g. 2026-04-19T12:00:00Z>",
  title: "<Short headline — plain, no hype>",
  subtitle: "<One sentence summarizing the release>",
  added: [
    // Each bullet: one verb-led past-tense sentence ending with a period.
    // No marketing verbs, no emojis. Backticks become <code> tags.
  ],
  changed: [ /* ... */ ],
  fixed: [ /* ... */ ],
  // Omit empty sections entirely (don't include removed: [] if nothing was removed)
}
```

**Style rules** (from the file's header comment):
- Plain, factual, README/man-page tone.
- Each bullet is one verb-led past-tense sentence ending with a period.
- No marketing verbs, no emojis, no call-to-action.
- Backticks in `releases.mjs` get converted to `<code>` tags in the feed.

### 3. Regenerate the Atom feed and HTML

```bash
cd ../feedzero-landing
node build-releases.mjs
```

This regenerates:
- `releases.xml` — the Atom feed at `https://feedzero.app/releases.xml`
- `index.html` — updates the release notes accordion on the landing page

Verify the output:
```bash
head -20 releases.xml  # Should show the new version as the first <entry>
```

### 4. Bump the version in feedzero

```bash
cd /home/DeadEye3164/builder/kindle/feedzero
```

Edit `package.json` — update the `"version"` field to the new version.

### 5. Update the vendored test fixture

```bash
cp ../feedzero-landing/releases.xml tests/fixtures/release-feed.xml
```

Then verify the parser contract test passes:
```bash
npx vitest run tests/core/parser/release-feed-fixture.test.ts
```

This test parses the vendored fixture through the app's parser and asserts the fields the app consumes (title, siteUrl, articles with title/link/content/publishedAt/guid). If the landing-side generator changed its format in a way that breaks the parser, this test catches it.

### 6. Take a fresh screenshot of the app

```bash
cd ../feedzero-landing
node take-screenshot.mjs
```

This launches the Vite dev server from the feedzero repo, captures the Explore tab at 1440x900, and saves `screenshot.png`. The `<img class="shot">` on the landing page renders it with rounded corners (`border-radius: 12px`) and a subtle shadow (`box-shadow`).

If the dev server is already running, use `--url`:
```bash
node take-screenshot.mjs --url http://localhost:3000
```

For a feeds view with articles loaded:
```bash
node take-screenshot.mjs --scene feeds
```

### 7. (Optional) Create a bento box page

If the user wants a social media visual for LinkedIn/Twitter, create a bento page:

```bash
mkdir -p ../feedzero-landing/releases/<VERSION>/
```

Create `../feedzero-landing/releases/<VERSION>/index.html`. Use `../feedzero-landing/releases/0.5.0/index.html` as a reference. The page must:
- Be a fixed 1200x630 landscape card (LinkedIn image dimensions), no scrolling required.
- Use the **same visual language as the landing page**: white background, 1px `#e5e7eb` borders, `#f8fafc` panel headers, slate text (`#0f172a`), gray descriptions (`#64748b`), eyebrow labels, `.tag` elements, `kbd` elements, `.word` passphrase pills, `.tile` illustration boxes. See `index.html`'s CSS for the exact values.
- Follow the writing style: plain, factual, verb-led. Each cell title is one short sentence ending with a period. No marketing verbs, no emojis, no exclamation marks.
- Include mini illustration tiles in each cell (sidebar mock-ups, tag pipelines, code snippets) — not just text. These fill the space and give visual texture.
- Have a stats footer row with key numbers (tests, feeds in catalog, encryption, etc.).

### 8. Commit and push — LANDING FIRST

**Deployment order matters.** The feedzero app fetches `https://feedzero.app/releases.xml` on first launch. If feedzero deploys before the landing site, new users see a 404 on auto-subscribe (swallowed by try/catch, non-fatal, but they won't see the release feed until next refresh).

```bash
# Landing repo — commit and push FIRST
cd ../feedzero-landing
git add releases.mjs releases.xml index.html screenshot.png
# Also add releases/<VERSION>/index.html if a bento page was created
git commit -m "release: v<VERSION> — <short title>"
git push origin main
```

Wait for the landing site to deploy. Verify:
```bash
curl -sSL "https://feedzero.app/releases.xml" | head -15
# Should show the new version as the first <entry>
```

```bash
# Feedzero repo — commit and push SECOND
cd /home/DeadEye3164/builder/kindle/feedzero
git add package.json tests/fixtures/release-feed.xml
git commit -m "release: bump version to <VERSION>, update release feed fixture"
git push origin main
```

### 9. Verify the live feed

```bash
curl -sSL "https://feedzero.app/releases.xml" | grep "<id>feedzero:release:<VERSION>"
```

If this returns the entry ID, the release is live. Existing users who refresh their release feed will see the new entry. New users auto-subscribing on first launch will get the full feed.

### 10. (Optional) Draft a LinkedIn post

If the user wants a social post, draft it in builder/maker tone:
- First-person, "here's what I shipped" energy
- Short, punchy paragraphs — one feature per paragraph
- Include the bento page URL for the visual
- Include the app URL
- Cover everything since the LAST LinkedIn post (ask the user which version that was)

## Important notes

- **Preserve entry IDs.** The `<id>` values in the Atom feed (`feedzero:release:<version>`) must never change after publishing. Changing them makes every existing subscriber re-import the entry as new.
- **The `feedzero:changelog` feed ID** in the `<feed>` element must also never change.
- **The `package.json` version** was historically out of sync (stuck at 0.2.1 while the release notes were at 0.4.0). Keep it in sync going forward.
- **The vendored fixture** (`tests/fixtures/release-feed.xml`) must be updated with every release so the parser contract test covers the latest format.
- **Run `npm test` in the feedzero repo** after updating the fixture to verify everything passes before pushing.
- **Docker images publish automatically** on every `v*.*.*` tag push via `.github/workflows/docker-publish.yml`. The workflow pushes to `ghcr.io/forcingfx/feedzero` always and additionally mirrors to `docker.io/forcingfx/feedzero` when the `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` repo secrets are set. No manual step during the release cut — once the tag is pushed in step 8, the workflow handles both registries.
