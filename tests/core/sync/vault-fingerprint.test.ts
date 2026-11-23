import { describe, it, expect } from "vitest";
import { fingerprintVault } from "../../../src/core/sync/vault-fingerprint.ts";
import type { VaultData } from "../../../src/core/sync/types.ts";
import type { Article, Feed } from "@feedzero/core/types";

const feed: Feed = {
  id: "feed-1",
  url: "https://example.com/feed.xml",
  title: "Example",
  description: "",
  siteUrl: "https://example.com",
  createdAt: 1,
  updatedAt: 1,
};

const article: Article = {
  id: "article-1",
  feedId: "feed-1",
  guid: "guid-1",
  title: "Post",
  link: "https://example.com/post",
  content: "",
  summary: "",
  author: "",
  publishedAt: 1,
  read: false,
  createdAt: 1,
};

function vault(overrides: Partial<VaultData> = {}): VaultData {
  return {
    version: 1,
    exportedAt: 1,
    feeds: [feed],
    articles: [article],
    ...overrides,
  };
}

describe("fingerprintVault", () => {
  it("ignores the export time, which differs on every export", async () => {
    expect(await fingerprintVault(vault({ exportedAt: 2 }))).toBe(
      await fingerprintVault(vault()),
    );
  });

  it("ignores per-device refresh bookkeeping on a feed", async () => {
    const refreshed: Feed = {
      ...feed,
      updatedAt: 99,
      lastFetchedAt: 99,
      lastSuccessfulFetchAt: 99,
      lastError: "temporary",
      consecutive304Count: 4,
      etag: 'W/"rotated"',
      lastModified: "Mon, 23 Nov 2026 10:00:00 GMT",
    };
    expect(await fingerprintVault(vault({ feeds: [refreshed] }))).toBe(
      await fingerprintVault(vault()),
    );
  });

  it("does not depend on key or collection order", async () => {
    const second = { ...article, id: "article-2", guid: "guid-2" };
    const reordered = Object.fromEntries(
      Object.entries(article).reverse(),
    ) as unknown as Article;
    expect(
      await fingerprintVault(vault({ articles: [second, reordered] })),
    ).toBe(await fingerprintVault(vault({ articles: [article, second] })));
  });

  it.each<[string, Partial<VaultData>]>([
    ["a read flag", { articles: [{ ...article, read: true }] }],
    ["a star", { articles: [{ ...article, starred: true } as Article] }],
    ["a new article", { articles: [article, { ...article, id: "new" }] }],
    ["a removed article", { articles: [] }],
    ["a feed rename", { feeds: [{ ...feed, title: "Renamed" }] }],
    ["a removed feed", { feeds: [] }],
    ["a folder", { folders: [{ id: "f", name: "News" } as never] }],
    ["a preference timestamp", { preferencesUpdatedAt: 5 }],
    ["a stored secret", { secrets: { anthropicKey: "key" } }],
  ])("changes when the user changes %s", async (_name, change) => {
    expect(await fingerprintVault(vault(change))).not.toBe(
      await fingerprintVault(vault()),
    );
  });
});
