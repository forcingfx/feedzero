import { describe, it, expect } from "vitest";
import {
  deriveVaultKey,
  encryptVault,
  decryptVault,
} from "../../../src/core/sync/vault-crypto.ts";
import type { VaultData } from "../../../src/core/sync/types.ts";
import type { Article, Feed } from "@feedzero/core/types";

/**
 * `starred`, `starredAt`, `extractedContent`, and `extractedAt` are new
 * optional fields on Article (slice 1 of the offline-prefetch feature).
 * They live inside the encrypted vault payload — no schema change required.
 * This is the contract test that they actually survive the encrypt → store
 * → decrypt round-trip without the encryption layer dropping them.
 */
describe("vault round-trip with starred + extracted fields", () => {
  const passphrase = "correct horse battery staple";

  function buildFeed(overrides: Partial<Feed> = {}): Feed {
    return {
      id: "feed-1",
      url: "https://example.com/feed.xml",
      title: "Example",
      description: "",
      siteUrl: "https://example.com",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      ...overrides,
    };
  }

  function buildArticle(overrides: Partial<Article> = {}): Article {
    return {
      id: "art-1",
      feedId: "feed-1",
      guid: "guid-1",
      title: "Hello",
      link: "https://example.com/a/1",
      content: "<p>teaser</p>",
      summary: "",
      author: "",
      publishedAt: 1_700_000_000_000,
      read: false,
      createdAt: 1_700_000_000_000,
      ...overrides,
    };
  }

  it("preserves starred + starredAt across encrypt/decrypt", async () => {
    const keyResult = await deriveVaultKey(passphrase);
    expect(keyResult.ok).toBe(true);
    if (!keyResult.ok) return;

    const vault: VaultData = {
      version: 2,
      exportedAt: Date.now(),
      feeds: [buildFeed()],
      articles: [
        buildArticle({ id: "art-1", starred: true, starredAt: 1_700_000_100_000 }),
        buildArticle({ id: "art-2", starred: false }),
      ],
    };

    const encResult = await encryptVault(keyResult.value, vault);
    expect(encResult.ok).toBe(true);
    if (!encResult.ok) return;

    const decResult = await decryptVault(keyResult.value, encResult.value);
    expect(decResult.ok).toBe(true);
    if (!decResult.ok) return;

    const [a1, a2] = decResult.value.articles;
    expect(a1.starred).toBe(true);
    expect(a1.starredAt).toBe(1_700_000_100_000);
    expect(a2.starred).toBe(false);
  });

  it("preserves extractedContent + extractedAt across encrypt/decrypt", async () => {
    const keyResult = await deriveVaultKey(passphrase);
    expect(keyResult.ok).toBe(true);
    if (!keyResult.ok) return;

    const extracted = "<article><h1>Full text</h1><p>Body…</p></article>";
    const vault: VaultData = {
      version: 2,
      exportedAt: Date.now(),
      feeds: [buildFeed()],
      articles: [
        buildArticle({
          id: "art-1",
          starred: true,
          starredAt: 1_700_000_100_000,
          extractedContent: extracted,
          extractedAt: 1_700_000_200_000,
        }),
      ],
    };

    const encResult = await encryptVault(keyResult.value, vault);
    expect(encResult.ok).toBe(true);
    if (!encResult.ok) return;

    const decResult = await decryptVault(keyResult.value, encResult.value);
    expect(decResult.ok).toBe(true);
    if (!decResult.ok) return;

    const [a1] = decResult.value.articles;
    expect(a1.extractedContent).toBe(extracted);
    expect(a1.extractedAt).toBe(1_700_000_200_000);
  });

  it("legacy articles (no new fields) still round-trip unchanged", async () => {
    // Back-compat: existing vaults from before this feature must continue
    // to decrypt cleanly with the new optional-typed Article shape.
    const keyResult = await deriveVaultKey(passphrase);
    expect(keyResult.ok).toBe(true);
    if (!keyResult.ok) return;

    const vault: VaultData = {
      version: 1,
      exportedAt: Date.now(),
      feeds: [buildFeed()],
      articles: [buildArticle({ id: "legacy" })],
    };

    const encResult = await encryptVault(keyResult.value, vault);
    expect(encResult.ok).toBe(true);
    if (!encResult.ok) return;

    const decResult = await decryptVault(keyResult.value, encResult.value);
    expect(decResult.ok).toBe(true);
    if (!decResult.ok) return;

    expect(decResult.value.articles[0].starred).toBeUndefined();
    expect(decResult.value.articles[0].extractedContent).toBeUndefined();
  });
});
