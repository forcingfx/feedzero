<!--
  Thanks for the PR. Keep this template short — fill in what's relevant, delete the rest.
  See CONTRIBUTING.md and CLAUDE.md for the full development workflow (RGR is mandatory).
-->

## Summary

-
-

## Why

<!-- Link a GitHub issue, GitLab issue, or describe the user-facing reason in one sentence. -->

## Test plan

- [ ] RED test exists (failing test added before production code)
- [ ] GREEN minimal (smallest code to make the test pass)
- [ ] REFACTOR done (Boy Scout Rule applied to touched files)
- [ ] `npm test` green
- [ ] `npx tsc --noEmit` clean
- [ ] Smoke tested in a real browser if the change is user-visible

## API change checklist (delete if no API change)

When changing `/api/*` request format, HTTP method, URL structure, or headers, all three entry points must be updated and verified — see CLAUDE.md "Three-entry-point rule".

- [ ] Shared handler updated (`src/core/proxy/proxy-handler.ts` or `src/core/sync/sync-handler.ts`)
- [ ] Hono server updated (`server.ts`)
- [ ] Vite dev proxy updated (`vite.config.js`)
- [ ] Vercel wrapper(s) updated (`api/*.ts`) — every supported HTTP method exported
- [ ] Routing contract test in `tests/server.test.ts` still passes

## Deployment / rollback

- [ ] Safe to deploy on merge (no migration coupling)
- [ ] Rollback path: Vercel → Deployments → "Promote previous deployment" (instant)
- [ ] Notes for on-call (env vars added, kill switches affected, etc.):
