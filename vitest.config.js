import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.{js,ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{js,ts,tsx}"],
      exclude: [
        "src/workers/**",
        "src/main.tsx",
        "src/**/*.d.ts",
        "src/types/**",
        "src/core/extractor/adapters/types.ts",
        "src/core/sync/types.ts",
        "src/core/catalog/catalog-types.ts",
        "src/components/ui/**",
      ],
      // Thresholds are enforced — CI fails on regression. These are the
      // floor; ratchet up as coverage improves.
      //
      // Target (next ratchet): branches 83, lines 90, statements 90, functions 90.
      // Reaching the lines/statements/functions targets needs UI-component coverage
      // (export-view, import-view, setup-wizard, feed-item, folder-item, feeds-page).
      // Branches already exceed the stated 83 target; lines/statements/functions
      // are just under. Ratchet up in dedicated PRs as new tests land. Do NOT
      // lower these numbers without explicit justification — that is a regression
      // by definition.
      thresholds: {
        branches: 83,
        functions: 75,
        lines: 82,
        statements: 82,
      },
    },
  },
});
