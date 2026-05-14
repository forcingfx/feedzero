// @ts-nocheck — dynamic imports of /src/* are Vite-resolved at runtime,
// not typecheckable by tsc. The test runs in browser via Playwright.
import { test, expect, type Page } from "@playwright/test";

/**
 * Production-grade sync stress test: Device A creates a sync account
 * with 100 feeds and pushes. Device B (separate browser context, SAME
 * derived keys) pulls and verifies all 100 feeds arrived intact.
 *
 * Strategy:
 *  - Derive keys ONCE up front via the project's own key-material
 *    module in a throwaway browser context. No Node-side
 *    reimplementation that could drift from the real derivation.
 *  - Inject the resulting StoredKeyMaterial into BOTH device contexts'
 *    localStorage via addInitScript, plus `onboarding-complete` and
 *    `storage-mode=sync`. Each device boots straight into the app as
 *    a returning sync user with the SAME vaultId — no onboarding-UI
 *    dependency.
 *  - Mock all `/api/feed` responses via page.route() so feed parsing
 *    runs on synthetic data, predictably, with no real network.
 *  - /api/sync is NOT mocked: goes to the Vite dev server's in-memory
 *    adapter, shared across both contexts via the dev-server process.
 *
 * Wait pattern: Pre-pin the store hooks to `window.__sync` via a setup
 * `evaluate`, then `waitForFunction` reads them synchronously. Earlier
 * the wait used an async predicate that dynamically imported the store
 * modules each poll; that pattern bailed out after the first false
 * return and the test continued mid-pull, observing the empty DB.
 *
 * What this test does NOT cover (out of scope, separate tests):
 *  - Real Upstash latency at scale → tests/smoke/sync-large-vault.test.ts
 *  - Cross-device round-trip data layer → tests/core/sync/cross-device-roundtrip.test.ts
 *  - Vault encryption correctness → tests/core/sync/vault-crypto.test.ts
 *  - Onboarding UI flow → tests/e2e/sync.spec.ts (existing)
 */

// Four non-EFF-wordlist tokens. Real passphrases use the EFF wordlist;
// this can't collide with a real user passphrase even if this test
// somehow ran against production.
const TEST_PASSPHRASE =
  "stresstest__alpha stresstest__beta stresstest__gamma stresstest__delta";
const FEED_COUNT = 100;

function mockFeedXml(i: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Stress Test Feed ${i}</title>
    <link>https://stress-test-${i}.example.com</link>
    <description>Synthetic feed ${i} for the 100-feed sync stress test</description>
    <item>
      <title>Article from feed ${i}</title>
      <link>https://stress-test-${i}.example.com/0</link>
      <description>Synthetic article.</description>
      <guid>stress-${i}-0</guid>
    </item>
  </channel>
</rss>`;
}

/** Intercept every `/api/feed` POST and return the right mock based on
 *  the URL the client passed in the body. */
async function mockAllFeedRequests(page: Page): Promise<void> {
  await page.route("**/api/feed*", async (route) => {
    const request = route.request();
    const body = request.postData();
    let targetUrl: string | null = null;
    if (body) {
      try {
        targetUrl = (JSON.parse(body) as { url?: string }).url ?? null;
      } catch {
        /* ignore */
      }
    }
    if (!targetUrl) {
      return route.fulfill({ status: 400, body: "Missing url" });
    }
    const match = /stress-test-(\d{3})/.exec(targetUrl);
    if (!match) {
      return route.fulfill({ status: 404, body: "Unknown stress URL" });
    }
    const i = Number.parseInt(match[1]!, 10);
    return route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/rss+xml" },
      body: mockFeedXml(i),
    });
  });
}

/** Pre-set the localStorage keys that make the app boot as a returning
 *  sync user with our test identity. */
async function preSetSyncIdentity(
  page: Page,
  storedKeys: unknown,
): Promise<void> {
  await page.addInitScript(
    ({ keys }) => {
      localStorage.setItem("feedzero:onboarding-complete", "true");
      localStorage.setItem("feedzero:storage-mode", "sync");
      localStorage.setItem("feedzero:derived-keys", JSON.stringify(keys));
    },
    { keys: storedKeys },
  );
}

test.describe("Sync at scale — 100 feeds across two devices", () => {
  test(
    "Device A pushes 100 feeds; Device B pulls them all",
    async ({ browser }) => {
      test.setTimeout(180_000);

      // === STEP 1: Derive sync keys via the project's own module ===
      const setupCtx = await browser.newContext();
      const setupPage = await setupCtx.newPage();
      await setupPage.goto("/");
      const storedKeys = await setupPage.evaluate(async (passphrase) => {
        const mod = await import("/src/core/storage/key-material.ts");
        const result = await mod.deriveAndStoreKeys(passphrase, undefined, {
          includeVaultKeys: true,
        });
        if (!result.ok) throw new Error(`derive failed: ${result.error}`);
        return JSON.parse(localStorage.getItem("feedzero:derived-keys")!);
      }, TEST_PASSPHRASE);
      await setupCtx.close();
      expect(storedKeys.vaultId).toMatch(/^[0-9a-f]{64}$/);

      // === STEP 2: Device A — add 100 feeds + force push ===
      const ctxA = await browser.newContext();
      const pageA = await ctxA.newPage();
      await preSetSyncIdentity(pageA, storedKeys);
      await mockAllFeedRequests(pageA);

      await pageA.goto("/feeds");

      await pageA.waitForFunction(
        async () => {
          const [appMod, syncMod] = await Promise.all([
            import("/src/stores/app-store.ts"),
            import("/src/stores/sync-store.ts"),
          ]);
          return (
            appMod.useAppStore.getState().isDbReady &&
            syncMod.useSyncStore.getState().credentials !== null
          );
        },
        undefined,
        { timeout: 30_000 },
      );

      const addResults = await pageA.evaluate(async (count) => {
        const mod = await import("/src/stores/feed-store.ts");
        const successes: string[] = [];
        const failures: Array<{ url: string; error: string }> = [];
        for (let i = 0; i < count; i++) {
          const url = `https://stress-test-${i.toString().padStart(3, "0")}.example.com/feed.xml`;
          try {
            await mod.useFeedStore.getState().addFeed(url);
            successes.push(url);
          } catch (e) {
            failures.push({
              url,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        return { successes: successes.length, failures };
      }, FEED_COUNT);
      expect(addResults.failures).toEqual([]);
      expect(addResults.successes).toBe(FEED_COUNT);

      const feedCountA = await pageA.evaluate(async () => {
        const mod = await import("/src/stores/feed-store.ts");
        return mod.useFeedStore.getState().feeds.length;
      });
      expect(feedCountA).toBe(FEED_COUNT);

      const pushOutcome = await pageA.evaluate(async () => {
        const mod = await import("/src/stores/sync-store.ts");
        await mod.useSyncStore.getState().push();
        return {
          status: mod.useSyncStore.getState().status,
          error: mod.useSyncStore.getState().error,
        };
      });
      expect(pushOutcome.error).toBeNull();
      expect(pushOutcome.status).toBe("synced");

      // === STEP 3: Device B — pull, verify all 100 feeds arrived ===
      const ctxB = await browser.newContext();
      const pageB = await ctxB.newPage();
      await preSetSyncIdentity(pageB, storedKeys);
      await mockAllFeedRequests(pageB);

      await pageB.goto("/feeds");

      // Wait for sync init + pull to settle.
      // Use a sync polling condition that reads from window — async
      // dynamic imports inside waitForFunction's evaluator seem to
      // cause Playwright to bail after the first false return.
      await pageB.evaluate(async () => {
        const [appMod, syncMod] = await Promise.all([
          import("/src/stores/app-store.ts"),
          import("/src/stores/sync-store.ts"),
        ]);
        (window as unknown as {
          __sync: { app: typeof appMod.useAppStore; sync: typeof syncMod.useSyncStore };
        }).__sync = { app: appMod.useAppStore, sync: syncMod.useSyncStore };
      });
      await pageB.waitForFunction(
        () => {
          const w = window as unknown as {
            __sync: {
              app: { getState: () => { isDbReady: boolean } };
              sync: { getState: () => { status: string } };
            };
          };
          if (!w.__sync) return false;
          return (
            w.__sync.app.getState().isDbReady &&
            w.__sync.sync.getState().status === "synced"
          );
        },
        undefined,
        { timeout: 60_000 },
      );

      // Force in-memory feed-store reload from IndexedDB.
      await pageB.evaluate(async () => {
        const mod = await import("/src/stores/feed-store.ts");
        await mod.useFeedStore.getState().loadFeeds();
      });

      const feedCountB = await pageB.evaluate(async () => {
        const mod = await import("/src/stores/feed-store.ts");
        return mod.useFeedStore.getState().feeds.length;
      });
      expect(feedCountB).toBe(FEED_COUNT);

      // Spot-check identity.
      const sampledUrlsPresent = await pageB.evaluate(async () => {
        const mod = await import("/src/stores/feed-store.ts");
        const feeds = mod.useFeedStore.getState().feeds;
        const samples = ["000", "049", "099"].map(
          (i) => `https://stress-test-${i}.example.com/feed.xml`,
        );
        return samples.map((url) => feeds.some((f) => f.url === url));
      });
      expect(sampledUrlsPresent).toEqual([true, true, true]);

      await ctxA.close();
      await ctxB.close();
    },
  );
});
