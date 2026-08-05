// Thin Vercel wrapper. ADR 007: scripts/build-api.js replaces this file with
// a self-contained esbuild bundle AT BUILD TIME, because Vercel compiles each
// api file individually and will not resolve cross-directory imports.
//
// This file must stay a wrapper IN GIT. Committing the built output freezes
// the endpoint: the import below disappears, the next build bundles the
// already-bundled file, and every later change to the shared handler silently
// stops deploying. That is how production served version "0.9.0" from a 0.13.0
// app — an earlier build inlined `process.env.APP_VERSION` as a literal, after
// which no later build could replace it. Guarded by
// tests/scripts/api-wrappers.test.ts.
import { handleHealthRequest } from "../src/core/health/health-handler";

export function GET(req: Request): Response {
  return handleHealthRequest(req);
}
