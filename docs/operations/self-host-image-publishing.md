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
