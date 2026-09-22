import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { open, close, addFeed, addArticles } from "@/core/storage/db";
import { createFeed, createArticle } from "@/core/storage/schema";
import { pushVault, pullVault } from "@/core/sync/sync-service";
import { deriveVaultId } from "@/core/sync/vault-crypto";
import { handleSyncRequest } from "@/core/sync/sync-handler";
import { createMemoryAdapter } from "@/core/sync/adapters/memory-adapter";
import { unwrap, isOk } from "@feedzero/core/utils/result";
import type { SyncStorageAdapter } from "@/core/sync/types";

/**
 * Contract test for the push transport: the bytes `pushVault` puts on
 * the wire are bytes `handleSyncRequest` can read.
 *
 * The client compresses; the handler decompresses. Those are two sides
 * of one agreement, and a unit test of either side alone would keep
 * passing if they disagreed — which is exactly how the request format
 * broke the day compression landed. So the only thing mocked here is
 * the network itself: the mock hands the request straight to the real
 * handler over a real adapter.
 */

const PASSPHRASE = "transport contract test passphrase";

let adapter: SyncStorageAdapter;

function installHandlerBackedNetwork(): void {
  adapter = createMemoryAdapter();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) =>
    handleSyncRequest(
      new Request(new URL(String(input), "http://localhost"), init),
      adapter,
    ),
  );
}

beforeEach(async () => {
  const result = await open(PASSPHRASE);
  if (!result.ok) throw new Error(result.error);
  installHandlerBackedNetwork();
});

afterEach(async () => {
  close();
  indexedDB.deleteDatabase("feedzero");
  vi.unstubAllGlobals();
});

async function seedVault(): Promise<void> {
  const feed = unwrap(
    createFeed({ url: "https://example.com/rss", title: "Contract" }),
  );
  await addFeed(feed);
  await addArticles(
    Array.from({ length: 40 }, (_, i) =>
      unwrap(
        createArticle({
          feedId: feed.id,
          title: `Article ${i}`,
          link: `https://example.com/${i}`,
        }),
      ),
    ),
  );
}

describe("sync push transport contract", () => {
  it("pushes a vault the handler accepts and a pull reads back", async () => {
    await seedVault();

    const pushed = await pushVault(PASSPHRASE);
    expect(isOk(pushed)).toBe(true);

    const pulled = unwrap(await pullVault(PASSPHRASE));
    expect(pulled.feeds).toHaveLength(1);
    expect(pulled.feeds[0].title).toBe("Contract");
    expect(pulled.articles).toHaveLength(40);
  });

  it("sends fewer bytes than the JSON it encodes", async () => {
    await seedVault();

    const sent: number[] = [];
    const inner = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PUT") {
          sent.push((init.body as Uint8Array).byteLength);
        }
        return inner(input as RequestInfo, init);
      },
    );

    expect(isOk(await pushVault(PASSPHRASE))).toBe(true);

    // The padded JSON is a power-of-two bucket; the wire form is the
    // compressed shadow of it. If this ratio ever drifts back toward 1
    // the transport has stopped compressing and large vaults are about
    // to stop syncing.
    const [wireBytes] = sent;
    expect(wireBytes).toBeGreaterThan(0);
    expect(wireBytes).toBeLessThan(64 * 1024 * 0.9);
  });

  it("stores the same vault bytes whichever transport the client used", async () => {
    await seedVault();
    expect(isOk(await pushVault(PASSPHRASE))).toBe(true);

    // Compression is transport-only: the handler unpacks before storing,
    // so what lands in the adapter is the same JSON an older client
    // would have PUT directly. That is what keeps a device still running
    // the previous build able to pull this vault.
    const vaultId = unwrap(await deriveVaultId(PASSPHRASE));
    const stored = unwrap(await adapter.get(vaultId));
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toHaveProperty("vault.ciphertext");
  });
});
