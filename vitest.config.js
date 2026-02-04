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
        "src/components/ui/**",
      ],
      thresholds: {
        branches: 83,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
