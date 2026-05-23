// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Smoke test: production-bundle boot. Loads the live FeedZero deploy in a
 * headless Chromium and asserts the app reaches a known-good DOM state
 * (the sidebar's "Open command palette" button is visible) — explicitly
 * the opposite of the failure mode from the 2026-05-23 incident, where
 * every fresh visit landed on "Failed to initialize" with a destructive
 * "Reset App" button.
 *
 * Why a smoke test and not a regular unit test: the bug only manifests in
 * the built artifact (Vite/Rollup chunk graph). Source-level tests
 * (Vitest + happy-dom) executed the source modules directly and never
 * saw the issue. The only thing that catches this class of regression is
 * a load of the deployed binary in a real browser.
 *
 * Skipped by default. Run with:
 *
 *   SMOKE_TESTS=1 npx vitest run tests/smoke/boot.test.ts
 *
 * Honors `SMOKE_BASE_URL` (default `https://my.feedzero.app`) and
 * `SMOKE_CHROMIUM_PATH` (default uses the playwright-core bundled
 * resolution).
 *
 * See: docs/incidents/2026-05-23-prod-bundle-boot-crash.md
 */

import type { Browser } from "playwright-core";

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

// Hard ceiling on how long the app may take to reach the good DOM state.
// Generous — production prod-cold + bundle download + crypto init can run
// 5-8s on a cold lambda + slow network combo. Tightening later is fine.
const BOOT_TIMEOUT_MS = 15_000;

describe.skipIf(SKIP)("production bundle boot smoke test (live browser)", () => {
  let browser: Browser;

  beforeAll(async () => {
    // Dynamic import so the smoke skip doesn't pay the playwright load cost
    // when the suite is skipped (which is the default for `npm test`).
    const { chromium } = await import("playwright-core");
    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      args: ["--no-sandbox"],
    };
    if (process.env.SMOKE_CHROMIUM_PATH) {
      launchOptions.executablePath = process.env.SMOKE_CHROMIUM_PATH;
    }
    browser = await chromium.launch(launchOptions);
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  it(
    "loads the home page and reaches a working sidebar within the boot budget",
    async () => {
      const page = await browser.newPage();
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text());
      });
      page.on("pageerror", (e) => {
        pageErrors.push(e.stack ?? e.message);
      });

      await page.goto(`${BASE_URL}/feeds`, {
        waitUntil: "load",
        timeout: BOOT_TIMEOUT_MS,
      });

      // Race the two terminal DOM states: the good state (sidebar palette
      // button mounted = AppInit cleared) vs the destructive failure
      // screen (the 2026-05-23 incident's user-visible signature). The
      // first to appear wins; if the bad one wins we fail with a useful
      // message rather than a generic timeout.
      const goodState = page
        .getByRole("button", { name: /open command palette/i })
        .waitFor({ state: "visible", timeout: BOOT_TIMEOUT_MS })
        .then(() => "good" as const);
      const badState = page
        .getByText(/Failed to initialize/i)
        .waitFor({ state: "visible", timeout: BOOT_TIMEOUT_MS })
        .then(() => "bad" as const);

      const outcome = await Promise.race([goodState, badState]);

      expect(
        outcome,
        `Production bundle showed the "Failed to initialize" screen. ` +
          `Console errors: ${consoleErrors.slice(0, 5).join(" | ")}. ` +
          `Page errors: ${pageErrors.slice(0, 3).join(" | ")}`,
      ).toBe("good");

      // No unhandled pageerrors. console.error is too noisy in production
      // (favicon misses, network noise) so we only assert on pageerror,
      // which are runtime exceptions.
      expect(
        pageErrors,
        `Unexpected page errors during boot: ${pageErrors.join("\n")}`,
      ).toEqual([]);

      await page.close();
    },
    BOOT_TIMEOUT_MS + 10_000,
  );
});
