# Env-spec audit

Single source of truth: [`expected-env.json`](../../expected-env.json) at
the repo root. Every environment variable the codebase reads has a
one-line spec entry; CI fails if a new `process.env.X` lands without
one.

## Why

Two production incidents traced to undocumented or stale env vars:

- **[2026-05-12 sync regression](../incidents/2026-05-12-sync-regression.md)** —
  a long-forgotten `SYNC_STORAGE=memory` in the Vercel project silently
  routed every PUT to a per-cold-start in-memory map. Nobody remembered
  setting it.
- **[2026-05-14 stats-always-zero](../incidents/2026-05-14-stats-always-zero.md)** —
  the catalog Upstash credentials were missing in production; the
  resolver silently fell through to memory.

The brand-based [test-only adapter
guard](../../src/core/test-only-brand.ts) catches the *symptom*; this
spec catches the *cause* (config drift between code and deployment).

## How CI uses it

The `env-audit` job runs `npm run check-env` on every PR. It scans
`src/`, `api/`, `scripts/`, `server.ts`, and `vite.config.js` for
references in three forms:

```text
process.env.FOO
env.FOO              // destructured arg inside resolvers
import.meta.env.FOO  // Vite-built SPA
```

For each reference, the spec must have an entry. For each spec entry,
some source file must reference the name. Either side drifting fails
CI.

## Operator runbook — audit Vercel against the spec

Run this locally after pulling deployment env, e.g. before a release:

```bash
vercel env pull .env.production.local --environment=production
npm run check-env -- --env .env.production.local --target production
```

What you'll see:

| Section | Means |
|---|---|
| **Source references missing from spec** | New `process.env.X` was added without updating `expected-env.json`. Either add the spec entry or drop the reference. |
| **Spec entries no source references** | The spec is stale. Delete the entry (or check whether the code was removed accidentally). |
| **Required for production but missing from deployment** | Deploy will half-work. Set the var in Vercel before next merge. |
| **Set in deployment but not required for production** | Either self-host-only (`SELF_HOSTED`, `PORT`, `DATA_DIR`) leaked into the Vercel project, or the requirement category is wrong in the spec. Delete it from Vercel. **This is the 2026-05-12 shape.** |
| **Set in deployment but undocumented in spec** | Vercel has a name nobody documented. Either add a spec entry (and verify the code that reads it still exists) or remove from Vercel. |

To audit self-host config, swap the target:

```bash
npm run check-env -- --env .env.self-host --target self-host
```

## Adding a new env variable

1. Reference it in code (`process.env.FOO`).
2. Add a one-line entry to `expected-env.json`:
   ```jsonc
   "FOO": {
     "required": "production" | "self-host" | "optional",
     "description": "Single sentence on what it does.",
     "consumers": ["src/path/to/reader.ts"]
   }
   ```
3. Set it in the deployment environment (Vercel or self-host `.env`).
4. CI now enforces the link.

## Categories

- **production** — required in the main Vercel deployment.
- **self-host** — required only when running `npm run serve` from the
  self-host bundle. The audit's `--target` flag controls which set is
  expected.
- **optional** — caller has a sensible default or graceful-degradation
  path (e.g. `GITHUB_FEEDBACK_TOKEN` absent → `/api/feedback` returns
  503 instead of crashing).
