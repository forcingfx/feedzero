# Runbook: publishing the self-host Docker image

Self-hosters consume `ghcr.io/forcingfx/feedzero` (optionally mirrored to
`docker.io/forcingfx/feedzero`). For `docker compose pull` / Portainer to
work, the image must (a) **exist** and (b) be **public**, and a current
release tag must produce `:latest`.

As of issue #212 the image had **never been published**:
`gh api /users/forcingfx/packages/container/feedzero` → **404**, and every
`docker-publish.yml` run had failed (an older version startup-failed; the
current tags-only version had never run because no `v*` tag was pushed
after it landed). The current workflow is `actionlint`-clean and the
Dockerfile now builds (verified), so a tag push should publish cleanly.

The CLI (`scripts/feedzero up`) builds from source with `--build`, so a
self-hoster is *never blocked* on this — but a pullable image is what makes
the "paste a compose file into Portainer and click Deploy" path work.

## 1. Publish the image, then make the package public

The package does not exist until the workflow pushes it once. **Order
matters** — you can't change visibility on a package that isn't there yet.

```bash
# (Requires PR #217 merged to main — main's Dockerfile must be the fixed one.)
# 1. Smoke-test the pipeline without cutting a release. A manual run tags
#    the image with the commit SHA (not `latest`) and creates the package:
gh workflow run docker-publish.yml --ref main
gh run watch "$(gh run list --workflow=docker-publish.yml -L1 --json databaseId --jq '.[0].databaseId')"
```

If that run is green, the package now exists (private by default — new GHCR
packages always are). Make it public (one-time, web UI; there is no `gh`
command for visibility): GitHub → your avatar → **Packages** → `feedzero` →
**Package settings** → **Change visibility → Public**, and **Connect
repository** so it inherits repo settings.

Verify from any machine with no auth:

```bash
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:forcingfx/feedzero:pull" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://ghcr.io/v2/forcingfx/feedzero/manifests/latest"
# 200 = public + tag exists.  403 = exists but private.  404 = not published / no such tag.
```

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
