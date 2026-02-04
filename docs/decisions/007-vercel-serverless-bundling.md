# ADR 007: Vercel Serverless Function Pre-Bundling

## Status
Accepted

## Context
FeedZero's API handlers (`proxy-handler.ts`, `sync-handler.ts`) live in `src/core/` and are consumed by three entry points: the Vite dev proxy, the Hono standalone server, and Vercel serverless functions in `api/`. The first two have bundlers (Vite, tsx) that resolve imports from `src/`. Vercel's serverless builder does not — it compiles each `api/*.ts` file individually without bundling cross-directory imports.

When `api/feed.ts` contained inlined SSRF validation (~70 lines, self-contained), Vercel handled it fine. When we refactored to `import { handleProxyRequest } from "../src/core/proxy/proxy-handler"` to share logic across entry points, all three endpoints started returning 500 with `ERR_MODULE_NOT_FOUND` in production.

## Decision

Use esbuild to pre-bundle each `api/*.ts` into a self-contained file with all dependencies inlined, replacing the `.ts` file content in-place during the build step.

The build script (`scripts/build-api.js`) runs as part of `npm run build:all` (which `vercel.json` uses as `buildCommand`). It:

1. Reads all `api/*.ts` files
2. Bundles each with esbuild (ESM, Node 20, all `src/` deps inlined)
3. Overwrites each `api/*.ts` with the bundled output (keeping `.ts` extension)

The original `.ts` source is what lives in git. The build script only modifies the working copy during Vercel's build.

## Constraints Discovered

Three undocumented Vercel behaviors constrained the solution:

1. **Vercel discovers functions pre-build.** It scans `api/` for `.ts`/`.js` files before running `buildCommand`, registers them, and expects them to still exist after the build completes. Deleting `.ts` files during the build causes `File not found`.

2. **Vercel compiles `api/*.ts` individually.** It does not bundle imports from `src/` or other directories. At runtime, those modules don't exist at `/var/task/src/core/...`.

3. **Vercel prefers `.ts` over `.js`.** When both `api/feed.ts` and `api/feed.js` exist, Vercel re-compiles the `.ts` and overwrites the `.js`, losing the pre-bundled output.

The in-place overwrite approach is the only solution that satisfies all three constraints: the `.ts` files exist pre- and post-build (constraint 1), their content has no external imports (constraint 2), and no `.js` files compete for priority (constraint 3).

## Alternatives Rejected

### `includeFiles` in `vercel.json`
Vercel's `functions.*.includeFiles` config can force-include `src/**` in the function bundle. However, Vercel compiles `.ts` to `.js` but does not compile the *included* files. The imports in `api/*.ts` use `.ts` extensions (project convention), which would need to change to `.js` for Node ESM resolution at runtime. This change would cascade through the entire `src/` dependency chain — too invasive for a deployment concern.

### Inlining handler logic in `api/*.ts`
This was the original approach (pre-`96af44f`). It works but duplicates ~140 lines of SSRF validation and proxy logic across `feed.ts` and `page.ts`, violating DRY. The build-time bundling achieves the same result (self-contained functions) without source-level duplication.

### `.mjs` output
Vercel ignores `.mjs` files in `api/`.

### Moving source to `src/api/`
Vercel discovers functions pre-build. An empty `api/` directory means no functions are registered (404 on all endpoints).

## Consequences

- `api/*.ts` files in git are thin wrappers (~5-10 lines each). They import shared handlers from `src/core/`.
- During build, `scripts/build-api.js` replaces their content with self-contained bundles (~200+ lines each, all deps inlined).
- Adding a new `api/*.ts` serverless function requires no special steps — `build-api.js` automatically discovers and bundles all `.ts` files in `api/`.
- `@vercel/blob` is marked as `external` in esbuild config because it's provided by Vercel's runtime.
- Contract tests in `tests/build/api-bundle.test.ts` verify that bundled output has no external imports and exports the correct functions.
- The Hono server (`server.ts`) and Vite dev proxy are unaffected — they resolve imports normally via their own bundlers.
