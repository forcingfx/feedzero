# Runbook: publishing the self-host Docker image

Self-hosters consume `ghcr.io/forcingfx/feedzero` (optionally mirrored to
`docker.io/forcingfx/feedzero`). Two things, **both maintainer-only**, must
be true for `docker compose pull` / Portainer to work for them. Issue #212
was caused by neither being true: the package was private and the only tag
was `v0.8.1`, so `:latest` was stale and anonymous pulls returned `denied`.

The CLI (`scripts/feedzero up`) builds from source with `--build`, so a
self-hoster is *never blocked* on this — but a pullable image is what makes
the "paste a compose file into Portainer and click Deploy" path work.

## 1. The GHCR package must be public

New GHCR packages are **private by default**. An anonymous pull of a private
package fails with `denied` (and the anonymous token endpoint returns 403).

Verify visibility from any machine with no auth:

```bash
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:forcingfx/feedzero:pull" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://ghcr.io/v2/forcingfx/feedzero/manifests/latest"
# 200 = public + tag exists.  403 = private.  404 = no such tag.
```

Make it public (one-time, web UI): GitHub → your profile/org → **Packages**
→ `feedzero` → **Package settings** → **Change visibility** → **Public**.
(Or link it to the repo and inherit visibility.) There is no `gh` command
for package visibility today; it must be done in the UI.

## 2. A current release tag must exist

`docker-publish.yml` triggers on `push: tags: v*.*.*` and tags the image
`vX.Y.Z`, `X.Y`, and `latest`. With no recent tag, `:latest` is whatever the
last tag built — `v0.8.1` at the time of #212, while `package.json` had
moved to 0.9.0 and the changelog to 0.11.0.

Cut a release with the `/new-release` flow. **It must bump `package.json`**
(this was skipped for 0.10.0 and 0.11.0, which is why prod `/api/health`
reported 0.9.0 — see PR for #211). Then:

```bash
git tag v0.11.0
git push origin v0.11.0      # fires docker-publish.yml
```

Confirm the workflow published, then re-run the visibility check above and
expect `200`.

## 3. (Optional) Docker Hub mirror

LAN/Portainer users often default to Docker Hub. Set repo secrets
`DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN`; `docker-publish.yml` then mirrors
to `docker.io/<owner>/feedzero` on the next tag. Without the secrets it
publishes to GHCR only (zero-config, nothing breaks).

## Quick triage when a self-hoster reports a pull failure

1. Run the visibility check. 403 → make public. 404 → no tag for that
   version; tell them `FEEDZERO_VERSION=latest` or cut the release.
2. Remind them `./scripts/feedzero up` builds locally and sidesteps the
   registry entirely.
3. Portainer users: Repository stack method, not web-editor paste — see
   `docs/self-hosting.md` (Deploying with Portainer).

## Automated releases (`/release`)

`/release` (the Claude skill in `.claude/skills/release/`) cuts a release
end to end and replaces the old `/new-release`:

1. **Local skill** — derives the version from conventional commits, drafts +
   lints the `releases.mjs` entry, runs `build-releases.mjs`, commits and
   pushes **landing first**, then polls until `feedzero.app/releases.xml`
   shows the new entry.
2. **Release PR** — the skill then opens `release/vX.Y.Z` against `main`
   carrying the `package.json` bump plus the vendored fixture refreshed from
   the live feed, and arms auto-merge. The bump is verified by the same
   required checks as any other change (`release-version-sync.test.ts` proves
   `package.json` equals the feed's newest entry) and merges itself.
3. **CI (`release-tag.yml`)** — reacts to the *merged* bump: re-checks
   `package.json` against the live landing feed and the existing tags
   (`scripts/release/tag-decision.mjs`), pushes the `vX.Y.Z` tag, and calls
   the reusable `docker-publish.yml` to publish the multi-arch image.

The four version touchpoints stay locked: landing notes → vendored fixture
(`release-version-sync.test.ts`) → `package.json` → git tag
(`docker-publish.yml` drift guard). Because the tag is derived from what is
on `main` rather than from an operator input, "tagged before the bump landed"
(v0.11.0, whose image reported 0.9.0 — #211/#212) is no longer expressible.

### Why the bump is a PR and not a CI push

`forcingfx` is a **user** account, not an organization. GitHub only allows
`Integration` bypass actors on org-owned rulesets, so the GitHub Actions app
can never be exempted from `main protection` here — every CI push to `main`
is rejected with `GH013: Changes must be made through a pull request`. The
predecessor `release.yml` pushed the bump commit directly and therefore could
never succeed; it sat unrun until both 0.13.0 attempts on 2026-08-02 failed
on it (first masked as a non-fast-forward race, then the bare rule violation).

Routing the bump through a PR needs no bypass, no PAT, and no relaxation of
branch protection — and it subjects the release commit to the full check
gauntlet, which a direct push would have skipped.

### One-time setup

None beyond the defaults. `release-tag.yml` only pushes **tags**, and the
ruleset targets the default branch (`refs/heads/main`), not `refs/tags/*`, so
the stock `GITHUB_TOKEN` with `contents: write` suffices.

`workflow_call` means `docker-publish.yml` is invoked by `release-tag.yml`
(a `GITHUB_TOKEN`-pushed tag does not itself trigger workflows); its original
`push: tags: v*.*.*` trigger still works for hand-pushed tags.
