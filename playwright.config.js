import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  webServer: {
    command: "npx vite --port 3001",
    port: 3001,
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://localhost:3001",
  },
});
