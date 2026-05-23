import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { open, close } from "@/core/storage/db";
import { createFeed, createArticle } from "@/core/storage/schema";
import { unwrap, isOk, isErr } from "@feedzero/core/utils/result";

import { checkVaultExists, mergeVaults } from "@/core/sync/sync-service";

describe("sync-service switch operations", () => {
  beforeEach(async () => {
    const result = await open("test-passphrase");
    if (!result.ok) throw new Error(result.error);
  });

  afterEach(() => {
    close();
    indexedDB.deleteDatabase("feedzero");
    vi.restoreAllMocks();
  });

  describe("checkVaultExists", () => {
    it("returns true when vault exists on server", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
        }),
      );

      const result = await checkVaultExists("valid-passphrase");
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(true);
    });

    it("returns false when vault does not exist (404)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: () => Promise.resolve("Not found"),
        }),
      );

      const result = await checkVaultExists("unknown-passphrase");
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(false);
    });

    it("returns err on server error (500)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Internal Server Error"),
        }),
      );

      const result = await checkVaultExists("any-passphrase");
      expect(isErr(result)).toBe(true);
    });

    it("returns err on network failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));

      const result = await checkVaultExists("any-passphrase");
      expect(isErr(result)).toBe(true);
    });

    it("uses HEAD request to check existence", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      vi.stubGlobal("fetch", fetchMock);

      await checkVaultExists("test-passphrase");

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toMatch(/\/api\/sync\?vaultId=[0-9a-f]{64}$/);
      expect(options.method).toBe("HEAD");
    });
  });

  describe("mergeVaults", () => {
    it("combines feeds from both vaults", () => {
      const localFeed = unwrap(
        createFeed({ url: "https://local.com/rss", title: "Local Feed" }),
      );
      const cloudFeed = unwrap(
        createFeed({ url: "https://cloud.com/rss", title: "Cloud Feed" }),
      );

      const localVault = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [localFeed],
        articles: [],
      };
      const cloudVault = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [cloudFeed],
        articles: [],
      };

      const result = mergeVaults(localVault, cloudVault);
      expect(isOk(result)).toBe(true);
      const merged = unwrap(result);
      expect(merged.feeds).toHaveLength(2);
      expect(merged.feeds.map((f) => f.url)).toContain("https://local.com/rss");
      expect(merged.feeds.map((f) => f.url)).toContain("https://cloud.com/rss");
    });

    it("deduplicates feeds by URL, preferring local version", () => {
      const localFeed = unwrap(
        createFeed({ url: "https://shared.com/rss", title: "Local Title" }),
      );
      const cloudFeed = unwrap(
        createFeed({ url: "https://shared.com/rss", title: "Cloud Title" }),
      );

      const localVault = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [localFeed],
        articles: [],
      };
      const cloudVault = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [cloudFeed],
        articles: [],
      };

      const result = mergeVaults(localVault, cloudVault);
      expect(isOk(result)).toBe(true);
      const merged = unwrap(result);
      expect(merged.feeds).toHaveLength(1);
      expect(merged.feeds[0].title).toBe("Local Title");
      expect(merged.feeds[0].id).toBe(localFeed.id);
    });

    it("combines articles from both vaults", () => {
      const localFeed = unwrap(
        createFeed({ url: "https://local.com/rss", title: "Local" }),
      );
      const cloudFeed = unwrap(
        createFeed({ url: "https://cloud.com/rss", title: "Cloud" }),
      );
      const localArticle = unwrap(
        createArticle({
          feedId: localFeed.id,
          title: "Local Post",
          link: "https://local.com/1",
        }),
      );
      const cloudArticle = unwrap(
        createArticle({
          feedId: cloudFeed.id,
          title: "Cloud Post",
          link: "https://cloud.com/1",
        }),
      );

      const localVault = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [localFeed],
        articles: [localArticle],
      };
      const cloudVault = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [cloudFeed],
        articles: [cloudArticle],
      };

      const result = mergeVaults(localVault, cloudVault);
      expect(isOk(result)).toBe(true);
      const merged = unwrap(result);
      expect(merged.articles).toHaveLength(2);
    });

    it("deduplicates articles by guid, preferring local version", () => {
      const feed = unwrap(
        createFeed({ url: "https://shared.com/rss", title: "Shared" }),
      );
      const localArticle = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Local Version",
          link: "https://shared.com/1",
          guid: "shared-guid",
        }),
      );
      const cloudArticle = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Cloud Version",
          link: "https://shared.com/1",
          guid: "shared-guid",
        }),
      );

      const localVault = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [feed],
        articles: [localArticle],
      };
      const cloudVault = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [feed],
        articles: [cloudArticle],
      };

      const result = mergeVaults(localVault, cloudVault);
      expect(isOk(result)).toBe(true);
      const merged = unwrap(result);
      expect(merged.articles).toHaveLength(1);
      expect(merged.articles[0].title).toBe("Local Version");
    });

    it("remaps cloud article feedIds to local feed ids for duplicate feeds", () => {
      const localFeed = unwrap(
        createFeed({ url: "https://shared.com/rss", title: "Local" }),
      );
      const cloudFeed = unwrap(
        createFeed({ url: "https://shared.com/rss", title: "Cloud" }),
      );
      const cloudArticle = unwrap(
        createArticle({
          feedId: cloudFeed.id,
          title: "Cloud Article",
          link: "https://shared.com/2",
          guid: "unique-cloud-guid",
        }),
      );

      const localVault = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [localFeed],
        articles: [],
      };
      const cloudVault = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [cloudFeed],
        articles: [cloudArticle],
      };

      const result = mergeVaults(localVault, cloudVault);
      expect(isOk(result)).toBe(true);
      const merged = unwrap(result);
      expect(merged.articles).toHaveLength(1);
      // The cloud article's feedId should be remapped to the local feed's id
      expect(merged.articles[0].feedId).toBe(localFeed.id);
    });

    it("handles empty local vault", () => {
      const cloudFeed = unwrap(
        createFeed({ url: "https://cloud.com/rss", title: "Cloud" }),
      );
      const cloudArticle = unwrap(
        createArticle({
          feedId: cloudFeed.id,
          title: "Cloud Post",
          link: "https://cloud.com/1",
        }),
      );

      const localVault = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [],
        articles: [],
      };
      const cloudVault = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [cloudFeed],
        articles: [cloudArticle],
      };

      const result = mergeVaults(localVault, cloudVault);
      expect(isOk(result)).toBe(true);
      const merged = unwrap(result);
      expect(merged.feeds).toHaveLength(1);
      expect(merged.articles).toHaveLength(1);
    });

    it("handles empty cloud vault", () => {
      const localFeed = unwrap(
        createFeed({ url: "https://local.com/rss", title: "Local" }),
      );

      const localVault = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [localFeed],
        articles: [],
      };
      const cloudVault = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [],
        articles: [],
      };

      const result = mergeVaults(localVault, cloudVault);
      expect(isOk(result)).toBe(true);
      const merged = unwrap(result);
      expect(merged.feeds).toHaveLength(1);
      expect(merged.feeds[0].title).toBe("Local");
    });
  });
});
