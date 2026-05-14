import { describe, it, expect, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

import {
  openWithKeys,
  addFeed,
  getFeeds,
  exportAll,
  deleteDatabase,
  close,
} from "@/core/storage/db";
import { createFeed } from "@/core/storage/schema";
import { deriveAndStoreKeys, clearStoredKeys } from "@/core/storage/key-material";
import { importCryptoKey } from "@/core/storage/crypto";
import { encryptVault, decryptVault } from "@/core/sync/vault-crypto";
import { importVault, pushVault } from "@/core/sync/sync-service";
import { useSyncStore } from "@/stores/sync-store";
import { SYNC, CRYPTO } from "@/utils/constants";
import { unwrap, isOk } from "@/utils/result";

/**
 * Stand-up a fake sync server: maps `/api/sync` PUT/GET/DELETE to an
 * in-memory map. Lets the test exercise the real pushVault/pullVault
 * code paths through `fetch` without spinning up a server.
 */
function installFakeSyncServer(): { reset: () => void } {
  const store = new Map<string, string>();
  const originalFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (!url.includes("/api/sync")) {
        return originalFetch(input as RequestInfo, init);
      }
      const method = init?.method ?? "GET";
      const parsed = new URL(url, "http://localhost");
      const vaultId = parsed.searchParams.get("vaultId");

      if (method === "PUT") {
        const body = JSON.parse(String(init?.body ?? "")) as {
          vaultId: string;
          vault: unknown;
        };
        store.set(
          body.vaultId,
          JSON.stringify({ ok: true, vault: body.vault }),
        );
        return new Response(
          JSON.stringify({ ok: true, updatedAt: Date.now() }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (method === "GET" || method === "HEAD") {
        if (!vaultId || !store.has(vaultId)) {
          return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(store.get(vaultId)!, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "DELETE") {
        if (vaultId) store.delete(vaultId);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("Method not allowed", { status: 405 });
    },
  );
  return { reset: () => store.clear() };
}

/**
 * Reproduces the bug pinned by tests/e2e/sync-100-feeds.spec.ts at the
 * integration level: when Device B opens the DB via `openWithKeys`
 * (JWKs that Device A derived and stored in localStorage) and runs
 * pullVault → importVault, the feeds must land in IndexedDB readable
 * via getFeeds.
 *
 * The E2E test exercises this through Playwright + the Vite dev server.
 * This integration test isolates the data layer so a failure points
 * directly at sync-service / db / crypto and not the UI.
 */
describe("cross-device sync round-trip via openWithKeys", () => {
  const PASSPHRASE = "stresstest alpha beta gamma delta";
  const FEED_COUNT = 3;

  afterEach(async () => {
    close();
    await deleteDatabase();
    clearStoredKeys();
  });

  it("Device B's pull (openWithKeys + importVault) populates IndexedDB", async () => {
    // ============================================================
    // Setup — derive once, both devices use the SAME stored JWKs.
    // Mirrors the E2E test's preSetSyncIdentity / restore() flow.
    // ============================================================
    const stored = unwrap(
      await deriveAndStoreKeys(PASSPHRASE, undefined, {
        includeVaultKeys: true,
      }),
    );
    expect(stored.vaultId).toBeTruthy();
    expect(stored.vaultKeyJwk).toBeTruthy();

    const vaultKey = await importCryptoKey(stored.vaultKeyJwk!, {
      name: CRYPTO.ALGORITHM,
      length: CRYPTO.KEY_LENGTH,
    });

    // ============================================================
    // Device A — open via stored JWKs, add feeds, encrypt vault
    // ============================================================
    const openA = await openWithKeys(stored.dbKeyJwk, stored.hmacKeyJwk);
    expect(isOk(openA)).toBe(true);

    for (let i = 0; i < FEED_COUNT; i++) {
      const feed = unwrap(
        createFeed({
          url: `https://device-a-feed-${i}.example.com/rss`,
          title: `Device A Feed ${i}`,
        }),
      );
      const addResult = await addFeed(feed);
      expect(isOk(addResult)).toBe(true);
    }

    const exported = unwrap(await exportAll());
    expect(exported.feeds).toHaveLength(FEED_COUNT);

    const encryptedVault = unwrap(
      await encryptVault(vaultKey, {
        version: SYNC.FORMAT_VERSION,
        exportedAt: Date.now(),
        feeds: exported.feeds,
        articles: exported.articles.map((a) => ({
          ...a,
          content: "",
          summary: "",
        })),
      }),
    );

    // ============================================================
    // Simulate device switch: close + wipe local state.
    // The stored JWKs (in localStorage) survive — that's how a
    // returning user on Device B re-opens the same key material.
    // ============================================================
    close();
    await deleteDatabase();

    // ============================================================
    // Device B — open via the SAME stored JWKs, decrypt, importVault
    // ============================================================
    const openB = await openWithKeys(stored.dbKeyJwk, stored.hmacKeyJwk);
    expect(isOk(openB)).toBe(true);

    const beforeImport = unwrap(await getFeeds());
    expect(beforeImport).toHaveLength(0);

    const decrypted = unwrap(await decryptVault(vaultKey, encryptedVault));
    expect(decrypted.feeds).toHaveLength(FEED_COUNT);

    const importResult = await importVault(decrypted);
    expect(isOk(importResult)).toBe(true);

    // The decisive assertion: after pull → import, the DB must contain
    // the feeds and they must be decryptable with the imported key.
    const afterImport = unwrap(await getFeeds());
    expect(afterImport).toHaveLength(FEED_COUNT);
    expect(afterImport.map((f) => f.url).sort()).toEqual(
      exported.feeds.map((f) => f.url).sort(),
    );
  });

  /**
   * Higher-fidelity reproducer: drives sync-store.pull() through a fake
   * HTTP layer to a fake adapter — same code path the E2E test exercises,
   * minus the browser. If this fails while the integration test above
   * passes, the bug is in sync-store orchestration, not the data layer.
   */
  it("sync-store pull() applies the cloud vault on Device B", async () => {
    const server = installFakeSyncServer();

    const stored = unwrap(
      await deriveAndStoreKeys(PASSPHRASE, undefined, {
        includeVaultKeys: true,
      }),
    );
    const vaultKey = await importCryptoKey(stored.vaultKeyJwk!, {
      name: CRYPTO.ALGORITHM,
      length: CRYPTO.KEY_LENGTH,
    });
    const credentials = { vaultId: stored.vaultId!, vaultKey };

    // Device A: open via JWKs, add feeds, push via sync-service
    unwrap(await openWithKeys(stored.dbKeyJwk, stored.hmacKeyJwk));
    for (let i = 0; i < FEED_COUNT; i++) {
      const feed = unwrap(
        createFeed({
          url: `https://store-feed-${i}.example.com/rss`,
          title: `Store Feed ${i}`,
        }),
      );
      unwrap(await addFeed(feed));
    }
    const pushed = await pushVault(credentials);
    expect(isOk(pushed)).toBe(true);

    // Device switch: wipe local state
    close();
    await deleteDatabase();
    server; // keep store intact

    // Device B: open via SAME JWKs, drive pull() through the store
    unwrap(await openWithKeys(stored.dbKeyJwk, stored.hmacKeyJwk));
    useSyncStore.setState({ credentials, status: "local-only", error: null });

    await useSyncStore.getState().pull();

    expect(useSyncStore.getState().status).toBe("synced");
    expect(useSyncStore.getState().error).toBeNull();

    const feedsAfterPull = unwrap(await getFeeds());
    expect(feedsAfterPull).toHaveLength(FEED_COUNT);
  });

  /**
   * Reproduces the actual symptom of the E2E test: two `pull()` calls
   * race concurrently after Device B opens. This mirrors AppInit's effect 1
   * (initializeReturningUser → pull) and effect 2 (refreshAll → pull)
   * firing back-to-back when `isDbReady` flips to true.
   *
   * importAll's clear+bulkPut is not transactional with itself across
   * concurrent callers, so interleaved clears can wipe just-written rows.
   */
  it("two concurrent pull()s do not leave the DB empty (Device B race)", async () => {
    installFakeSyncServer();

    const stored = unwrap(
      await deriveAndStoreKeys(PASSPHRASE, undefined, {
        includeVaultKeys: true,
      }),
    );
    const vaultKey = await importCryptoKey(stored.vaultKeyJwk!, {
      name: CRYPTO.ALGORITHM,
      length: CRYPTO.KEY_LENGTH,
    });
    const credentials = { vaultId: stored.vaultId!, vaultKey };

    // Device A: push a 100-feed vault.
    unwrap(await openWithKeys(stored.dbKeyJwk, stored.hmacKeyJwk));
    for (let i = 0; i < 100; i++) {
      const feed = unwrap(
        createFeed({
          url: `https://race-feed-${String(i).padStart(3, "0")}.example.com/rss`,
          title: `Race Feed ${i}`,
        }),
      );
      unwrap(await addFeed(feed));
    }
    unwrap(await pushVault(credentials));

    close();
    await deleteDatabase();

    // Device B: open + start TWO concurrent pulls, mirroring the AppInit
    // effect-1 + effect-2 race when isDbReady flips to true.
    unwrap(await openWithKeys(stored.dbKeyJwk, stored.hmacKeyJwk));
    useSyncStore.setState({ credentials, status: "local-only", error: null });

    await Promise.all([
      useSyncStore.getState().pull(),
      useSyncStore.getState().pull(),
    ]);

    expect(useSyncStore.getState().status).toBe("synced");
    const feedsAfterRace = unwrap(await getFeeds());
    expect(feedsAfterRace.length).toBe(100);
  });
});
