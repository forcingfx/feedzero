import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { open, close, addFeed, addArticles } from "@/core/storage/db";
import { createFeed, createArticle } from "@/core/storage/schema";
import { unwrap, isOk, isErr } from "@/utils/result";

// Must import after fake-indexeddb
import {
  exportVault,
  importVault,
  pushVault,
  pullVault,
} from "@/core/sync/sync-service";

describe("sync-service", () => {
  beforeEach(async () => {
    const result = await open("test-passphrase");
    if (!result.ok) throw new Error(result.error);
  });

  afterEach(() => {
    close();
    indexedDB.deleteDatabase("feedzero");
    vi.restoreAllMocks();
  });

  describe("exportVault", () => {
    it("captures all feeds and articles into a VaultData", async () => {
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Example" }),
      );
      await addFeed(feed);
      const article = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post",
          link: "https://example.com/1",
        }),
      );
      await addArticles([article]);

      const result = await exportVault();
      expect(isOk(result)).toBe(true);
      const vault = unwrap(result);
      expect(vault.version).toBe(1);
      expect(vault.feeds).toHaveLength(1);
      expect(vault.feeds[0].title).toBe("Example");
      expect(vault.articles).toHaveLength(1);
      expect(vault.articles[0].title).toBe("Post");
      expect(vault.exportedAt).toBeGreaterThan(0);
    });

    it("returns empty arrays for an empty database", async () => {
      const vault = unwrap(await exportVault());
      expect(vault.feeds).toEqual([]);
      expect(vault.articles).toEqual([]);
    });
  });

  describe("importVault", () => {
    it("replaces local data with vault contents", async () => {
      // Add existing data
      const oldFeed = unwrap(
        createFeed({ url: "https://old.com/rss", title: "Old" }),
      );
      await addFeed(oldFeed);

      // Import new vault
      const newFeed = unwrap(
        createFeed({ url: "https://new.com/rss", title: "New" }),
      );
      const newArticle = unwrap(
        createArticle({
          feedId: newFeed.id,
          title: "New Post",
          link: "https://new.com/1",
        }),
      );

      const result = await importVault({
        version: 1,
        exportedAt: Date.now(),
        feeds: [newFeed],
        articles: [newArticle],
      });
      expect(isOk(result)).toBe(true);

      // Verify via export
      const exported = unwrap(await exportVault());
      expect(exported.feeds).toHaveLength(1);
      expect(exported.feeds[0].title).toBe("New");
      expect(exported.articles).toHaveLength(1);
      expect(exported.articles[0].title).toBe("New Post");
    });
  });

  describe("pushVault", () => {
    it("encrypts and PUTs vault to /api/sync", async () => {
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Example" }),
      );
      await addFeed(feed);

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, updatedAt: Date.now() }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await pushVault("test-passphrase");
      expect(isOk(result)).toBe(true);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toMatch(/\/api\/sync$/);
      expect(options.method).toBe("PUT");
      expect(options.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(options.body);
      expect(body.vaultId).toMatch(/^[0-9a-f]{64}$/);
      expect(body.vault.version).toBe(1);
      expect(typeof body.vault.ciphertext).toBe("string");
    });

    it("returns err on network failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error")),
      );

      const result = await pushVault("test-passphrase");
      expect(isErr(result)).toBe(true);
    });

    it("returns err when server responds with error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Internal Server Error"),
        }),
      );

      const result = await pushVault("test-passphrase");
      expect(isErr(result)).toBe(true);
    });
  });

  describe("pullVault", () => {
    it("fetches and decrypts vault from /api/sync", async () => {
      // First push so there's something to pull
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Pull Test" }),
      );
      await addFeed(feed);

      // Export and encrypt locally to create a valid server response
      const { encryptVault, deriveVaultKey } =
        await import("@/core/sync/vault-crypto");
      const vault = unwrap(await exportVault());
      const key = unwrap(await deriveVaultKey("test-passphrase"));
      const encrypted = unwrap(await encryptVault(key, vault));

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ ok: true, vault: encrypted }),
        }),
      );

      const result = await pullVault("test-passphrase");
      expect(isOk(result)).toBe(true);
      const pulled = unwrap(result);
      expect(pulled.feeds).toHaveLength(1);
      expect(pulled.feeds[0].title).toBe("Pull Test");
    });

    it("returns err when vault does not exist (404)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: () => Promise.resolve("Not found"),
        }),
      );

      const result = await pullVault("test-passphrase");
      expect(isErr(result)).toBe(true);
    });

    it("returns err on network failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));

      const result = await pullVault("test-passphrase");
      expect(isErr(result)).toBe(true);
    });
  });
});
