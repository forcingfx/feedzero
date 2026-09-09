import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@feedzero/core": path.resolve(import.meta.dirname, "./packages/core/src"),
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "happy-dom",
    // happy-dom is a real resource loader: a <link rel="stylesheet"> or
    // <iframe src> in a fixture makes it open a socket to the URL. The unit
    // suite must never touch the network, and nothing awaited those loads,
    // so they only showed up as ECONNREFUSED stack traces in every run.
    // tests/environment/no-real-network.test.ts pins this.
    environmentOptions: {
      happyDOM: {
        settings: {
          disableCSSFileLoading: true,
          disableJavaScriptFileLoading: true,
          disableIframePageLoading: true,
          handleDisabledFileLoadingAsSuccess: true,
        },
      },
    },
    include: ["tests/**/*.test.{js,ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    // Unhandled rejections FAIL the run rather than printing "Errors 1"
    // beside a zero exit code. Vitest's default let a missing module
    // mock (an async store write rejecting after its test resolved)
    // pass `npm test` locally and only trip the pre-push hook — the
    // local gate must mean what the hook means (2026-08-01 SDLC retro).
    dangerouslyIgnoreUnhandledErrors: false,
    coverage: {
      provider: "v8",
      include: [
        "src/**/*.{js,ts,tsx}",
        "packages/core/src/**/*.{js,ts,tsx}",
      ],
      exclude: [
        "src/workers/**",
        "src/main.tsx",
        "src/**/*.d.ts",
        "packages/core/src/types/**",
        "src/core/extractor/adapters/types.ts",
        "src/core/sync/types.ts",
        "src/core/catalog/catalog-types.ts",
        "src/components/ui/**",
      ],
      // Thresholds are enforced — CI fails on regression. These are the
      // floor; ratchet up as coverage improves.
      //
      // Vitest 4 (#286) changed the measurement, not the code: coverage-v8
      // now remaps through the AST by default, so functions and branches are
      // counted the way Istanbul counts them rather than as raw V8 byte
      // ranges. The same tree went from 1,566 to 2,562 counted functions and
      // branch coverage read 87.5% → 76.8% with zero test changes. The
      // branches floor was re-based to the measured value on that day; the
      // other three still clear their floors under the new counting.
      //
      // Target (next ratchet): branches 83, lines 90, statements 90, functions 90.
      // The biggest branch gaps under the new counting are files at 0%:
      // ai-overview-client, briefing-page, ai-signal-store, briefing-abstract,
      // existing-cloud-flow. Ratchet up in dedicated PRs as new tests land.
      // Do NOT lower these numbers without explicit justification — that is
      // a regression by definition.
      thresholds: {
        branches: 76,
        functions: 75,
        lines: 82,
        statements: 82,
      },
    },
  },
});
