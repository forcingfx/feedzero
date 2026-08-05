import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const REPO = path.resolve(__dirname, "../..");

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: REPO, encoding: "utf8" });

/**
 * Read COMMITTED content, not the working tree.
 *
 * tests/build/api-bundle.test.ts deliberately bundles api/ in place and
 * restores it afterwards, so the working tree holds build output for part of
 * any run. The invariant here is about what is committed, and reading from
 * git also makes this test immune to that interleaving.
 */
const committed = (relPath: string) => git("show", `HEAD:${relPath}`);

const apiFiles = () =>
  git("ls-files", "api")
    .split("\n")
    .filter((f) => f.endsWith(".ts"));

/**
 * `api/*.ts` in git must be THIN WRAPPERS that import from `src/`.
 *
 * scripts/build-api.js takes api/*.ts as its esbuild entry points and
 * overwrites them in place with self-contained bundles (ADR 007 — Vercel
 * compiles each api file individually and will not resolve cross-directory
 * imports). That is correct as a BUILD step and wrong as a COMMITTED state:
 * once a bundle is committed, the wrapper's `import ... from "../src/..."` is
 * gone, so the next build bundles the already-bundled file and every later
 * change to the shared handler silently fails to deploy.
 *
 * That is not hypothetical. Every api file was a committed bundle, and
 * production served `/api/health` with `version: "0.9.0"` while the app was
 * at 0.13.0 — an earlier build had inlined `process.env.APP_VERSION` as the
 * literal "0.9.0", after which no later build could ever replace it.
 *
 * If this test fails: do NOT commit the built output. Restore the wrapper,
 * and let the build produce bundles into the deployment only.
 */
/**
 * Endpoints still frozen as committed bundles, tracked for restoration.
 *
 * Restoring one means reconstructing its wrapper from bundled output —
 * several build adapters from env or pass option objects — and verifying the
 * rebuilt endpoint on a preview deployment before merge. That is per-endpoint
 * work with real blast radius, so it is deliberately not done in bulk.
 *
 * Removing an entry from this list is the definition of done for that
 * endpoint. Do not add to it.
 */
const KNOWN_FROZEN = new Set([
  "api/briefing.ts",
  "api/catalog.ts",
  "api/checkout/create-session.ts",
  "api/feed.ts",
  "api/feedback.ts",
  "api/icon.ts",
  "api/license/[action].ts",
  "api/page.ts",
  "api/stats-sync.ts",
  "api/stripe/webhook.ts",
  "api/sync.ts",
]);

describe("api wrappers stay wrappers (ADR 007)", () => {
  const files = apiFiles().filter((f) => !KNOWN_FROZEN.has(f));

  it("finds the api entry points", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)(
    "%s imports its handler from src/ instead of inlining it",
    (file) => {
      const source = committed(file);

      expect(
        /from\s+["']\.\.?\/(\.\.\/)*src\//.test(source),
        "no import from src/ — this looks like committed build output",
      ).toBe(true);
    },
  );

  it.each(files)("%s carries no bundler artefacts", (file) => {
    const source = committed(file);

    // esbuild stamps @ts-nocheck and pure-annotation comments into output.
    expect(source).not.toContain("@ts-nocheck");
    expect(source).not.toContain("/* @__PURE__ */");
  });
});
