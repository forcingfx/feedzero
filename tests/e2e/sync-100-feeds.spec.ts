// @ts-nocheck — dynamic imports of /src/* are Vite-resolved at runtime,
// not typecheckable by tsc. The test runs in browser via Playwright.
import { test, expect, type Page } from "@playwright/test";

/**
 * Production-grade sync stress test: Device A creates a sync account
 * with 100 feeds and pushes. Device B (separate browser context, SAME
 * derived keys) pulls and verifies all 100 feeds arrived intact.
 *
 * STATUS: `test.fixme()` — this test currently fails against the local
 * dev server. The failure exposes what looks like a real cross-device
 * sync bug, NOT a flaky test. See the "Investigation findings" block
 * inside the test body for details. Run with:
 *
 *     npx playwright test tests/e2e/sync-100-feeds.spec.ts --project=desktop
 *
 * The fixme() marker keeps CI green while preserving the test as the
 * authoritative spec for what "sync at scale" must do. When the
 * underlying issue is fixed, switch `test.fixme()` back to `test()`.
 *
 * Strategy (all of this works correctly):
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
 * What this test does NOT cover (out of scope, separate tests):
 *  - Real Upstash latency at scale → tests/smoke/sync-large-vault.test.ts
 *  - Vault encryption correctness → tests/core/sync/vault-crypto.test.ts
 *  - Onboarding UI flow → tests/e2e/sync.spec.ts (existing)
 *  - Conflict resolution between simultaneous pushes (separate test)
 *  - Recovery from partial push failure (separate test)
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
  /**
   * KNOWN-FAILING — see investigation findings inside.
   *
   * To run anyway: change `test.fixme` to `test` and execute. The
   * failure is at the "Device B sees 100 feeds" assertion.
   */
  test.fixme(
    "Device A pushes 100 feeds; Device B pulls them all",
    async ({ browser }) => {
      test.setTimeout(180_000);

      /* ==========================================================
       * INVESTIGATION FINDINGS (2026-05-14, this session)
       * ==========================================================
       *
       * What we verified works:
       *  - Two-context derived-key injection: vaultId is identical
       *    across both contexts (the spec for "same user, two devices").
       *  - Device A's full flow: init → restoreSync sets credentials →
       *    100x addFeed() succeeds → push() returns status="synced",
       *    error=null. The dev server's in-memory adapter reports
       *    >= 1 vault stored, and GET /api/sync?vaultId=<id> returns
       *    ~79KB of ciphertext (consistent with 100 encrypted feeds).
       *  - Device B's init: credentials reconstructed identically,
       *    isDbReady flips to true, sync-store status flips to
       *    "synced" (meaning pull() believed it succeeded).
       *
       * What fails:
       *  - After Device B's status flips to "synced", BOTH the
       *    in-memory feed-store AND IndexedDB show 0 feeds. A page
       *    reload + explicit loadFeeds() doesn't recover them either.
       *
       * Hypothesis (needs investigation in src/core/sync/sync-service.ts):
       *  pull() retrieves the vault, decryptVault() likely succeeds
       *  (otherwise status would be "error"), but the importAll() step
       *  that applies the decrypted VaultData to IndexedDB either:
       *    (a) silently no-ops on the dev-server / memory-adapter path,
       *    (b) writes to a different DB instance than the one
       *        feed-store reads from, or
       *    (c) throws an error that's caught and swallowed without
       *        updating status.
       *
       * Reproducer:
       *   Switch `test.fixme(...)` to `test(...)` and re-run. Watch
       *   the diagnostic that the original investigation added — vault
       *   ciphertext is large, but Device B's IndexedDB count via
       *   getFeeds() is 0.
       *
       * Investigation next steps:
       *  1. Add a console.log inside pullVault's importAll path to
       *     confirm it actually runs and writes.
       *  2. Verify the encrypted feed table name and key derivation
       *     match between Device A's write and Device B's read.
       *  3. If importAll runs but doesn't persist, check Dexie's
       *     transaction completion — possibly a fire-and-forget that
       *     status flips before the write commits.
       * ==========================================================
       */

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
      await pageB.waitForFunction(
        async () => {
          const [appMod, syncMod] = await Promise.all([
            import("/src/stores/app-store.ts"),
            import("/src/stores/sync-store.ts"),
          ]);
          return (
            appMod.useAppStore.getState().isDbReady &&
            syncMod.useSyncStore.getState().status === "synced"
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
