import { defineConfig, devices } from "@playwright/test";

/**
 * The offline spec needs a production build: the dev server ships no service
 * worker. It runs against the self-host server serving `dist/`, the same
 * assembly a self-hoster runs. Set E2E_OFFLINE_BASE_URL to point it at a
 * deployed environment instead (feeds are mocked in the browser, so nothing
 * is written to that environment).
 */
const OFFLINE_PORT = 3002;
const OFFLINE_SPEC = /offline\.spec\.ts/;
const offlineBaseUrl =
  process.env.E2E_OFFLINE_BASE_URL ?? `http://localhost:${OFFLINE_PORT}`;

const devServer = {
  command: "npx vite --port 3001",
  port: 3001,
  reuseExistingServer: !process.env.CI,
  timeout: 30000,
};

const productionBuildServer = {
  command: `npm run build && PORT=${OFFLINE_PORT} SELF_HOSTED=1 node --import tsx server.ts`,
  port: OFFLINE_PORT,
  reuseExistingServer: !process.env.CI,
  timeout: 120000,
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: process.env.E2E_OFFLINE_BASE_URL
    ? [devServer]
    : [devServer, productionBuildServer],
  projects: [
    { name: "desktop", testIgnore: OFFLINE_SPEC, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testIgnore: OFFLINE_SPEC, use: { ...devices["Pixel 5"] } },
    {
      name: "offline",
      testMatch: OFFLINE_SPEC,
      use: { ...devices["Desktop Chrome"], baseURL: offlineBaseUrl },
    },
  ],
});
