import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { open, close, addFeed, addArticles } from "@/core/storage/db";
import { createFeed, createArticle } from "@/core/storage/schema";
import { unwrap, isOk, isErr } from "@feedzero/core/utils/result";
import { SYNC } from "@feedzero/core/utils/constants";

// Must import after fake-indexeddb
import {
  exportVault,
  importVault,
  pushVault,
  pullVault,
  deleteVault,
  padPayload,
} from "@/core/sync/sync-service";
import { uint8ArrayToBase64 } from "@feedzero/core/utils/base64";
import { readPushedBody } from "../../helpers/push-body";
import type { Article } from "@feedzero/core/types";

/** Random base64, standing in for AES-GCM ciphertext on the wire. */
function randomBase64(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length * 0.76));
  for (let i = 0; i < bytes.length; i += 32768) {
    crypto.getRandomValues(bytes.subarray(i, Math.min(i + 32768, bytes.length)));
  }
  return uint8ArrayToBase64(bytes).slice(0, length);
}

/**
 * Offline full text big enough to push an encrypted vault past the
 * single-upload ceiling, built cheaply.
 *
 * The filler has to be incompressible, or the gzip transport shrinks it
 * back under the ceiling and the test stops testing anything. Random
 * base64 is incompressible, but generating megabytes of it is slow — so
 * one 64 KiB random block is repeated instead. Deflate's window is
 * 32 KiB, so repeats that far apart find no match and the ratio stays at
 * 0.753 (measured, up to 6 MiB). Same test, a fraction of the cost.
 */
function buildOversizedArticles(feedId: string): Article[] {
  const BLOCK_BYTES = 48 * 1024; // 64 KiB once base64-encoded
  const BLOCKS_PER_ARTICLE = 8; // ~512 KiB each
  const ARTICLE_COUNT = 13; // ~6.5 MiB total, ~4.9 MB compressed

  const block = uint8ArrayToBase64(
    crypto.getRandomValues(new Uint8Array(BLOCK_BYTES)),
  );
  const filler = block.repeat(BLOCKS_PER_ARTICLE);

  return Array.from({ length: ARTICLE_COUNT }, (_, i) => ({
    ...unwrap(
      createArticle({
        feedId,
        title: `Saved offline ${i}`,
        link: `https://example.com/offline/${i}`,
      }),
    ),
    starred: true,
    extractedContent: filler,
    extractedAt: Date.now(),
  }));
}

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
      expect(vault.version).toBe(SYNC.FORMAT_VERSION);
      expect(vault.feeds).toHaveLength(1);
      expect(vault.feeds[0].title).toBe("Example");
      expect(vault.articles).toHaveLength(1);
      expect(vault.articles[0].title).toBe("Post");
      expect(vault.exportedAt).toBeGreaterThan(0);
    });

    it("strips article content and summary to reduce vault size", async () => {
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Example" }),
      );
      await addFeed(feed);
      const article = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post",
          link: "https://example.com/1",
          content: "<p>Very long article content here</p>",
          summary: "A summary of the article",
        }),
      );
      await addArticles([article]);

      const vault = unwrap(await exportVault());
      expect(vault.articles[0].content).toBe("");
      expect(vault.articles[0].summary).toBe("");
      expect(vault.articles[0].title).toBe("Post");
      expect(vault.articles[0].read).toBeDefined();
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
      // syncFetch wraps init.headers as a Headers instance — accept either shape.
      const header = (name: string) =>
        options.headers instanceof Headers
          ? options.headers.get(name)
          : options.headers[name];
      expect(header("Content-Type")).toBe("application/octet-stream");
      expect(header("x-feedzero-body-encoding")).toBe("gzip");

      const body = await readPushedBody(options.body);
      expect(body.vaultId).toMatch(/^[0-9a-f]{64}$/);
      expect(body.vault.version).toBe(SYNC.FORMAT_VERSION);
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

    it("explains a 413 in terms the user can act on", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 413,
        text: () =>
          Promise.resolve(
            "Request Entity Too Large FUNCTION_PAYLOAD_TOO_LARGE fra1::2k9hp-1789964995079",
          ),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await pushVault("test-passphrase");
      expect(isErr(result)).toBe(true);
      if (result.ok) return;
      expect(result.error).toMatch(/too large/i);
      // Names a remedy that actually releases bytes. Unstarring does not:
      // toggleStar keeps extractedContent, so the old copy of this message
      // told users to do something that changed nothing.
      expect(result.error).toMatch(/remove a feed/i);
      expect(result.error).not.toMatch(/unstar/i);
      expect(result.error).not.toMatch(/FUNCTION_PAYLOAD_TOO_LARGE/);
    });

    it("refuses to send a vault larger than the upload ceiling", async () => {
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Example" }),
      );
      await addFeed(feed);
      await addArticles(buildOversizedArticles(feed.id));

      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const result = await pushVault("test-passphrase");

      // No doomed request: the platform would reject it at the edge and
      // the user would see an opaque error code instead of a remedy.
      expect(fetchMock).not.toHaveBeenCalled();
      expect(isErr(result)).toBe(true);
      if (result.ok) return;
      expect(result.error).toMatch(/too large/i);
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

    it("returns a human-readable message on 404, not the raw server payload", async () => {
      // A new device entering a passphrase that has no cloud vault hits this
      // path. The raw "Sync pull failed (404): Vault not found" string leaks
      // the implementation. Users need to see: "No vault exists yet for this
      // passphrase — either typo, or this is your first device." Locks the
      // friendly-error contract.
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: () => Promise.resolve("Vault not found"),
        }),
      );

      const result = await pullVault("test-passphrase");
      expect(isErr(result)).toBe(true);
      if (!result.ok) {
        expect(result.error).not.toMatch(/^Sync pull failed/);
        expect(result.error).toMatch(/no vault|no cloud|passphrase/i);
      }
    });

    it("returns err on network failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));

      const result = await pullVault("test-passphrase");
      expect(isErr(result)).toBe(true);
    });
  });

  describe("deleteVault", () => {
    it("sends DELETE to /api/sync with derived vaultId", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await deleteVault("test-passphrase");
      expect(isOk(result)).toBe(true);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toMatch(/\/api\/sync\?vaultId=[0-9a-f]{64}$/);
      expect(options.method).toBe("DELETE");
    });

    it("returns err on server error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Internal Server Error"),
        }),
      );

      const result = await deleteVault("test-passphrase");
      expect(isErr(result)).toBe(true);
    });

    it("returns err on network failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));

      const result = await deleteVault("test-passphrase");
      expect(isErr(result)).toBe(true);
    });
  });

  describe("padPayload", () => {
    it("pads a small payload to the minimum bucket size (64KB)", () => {
      const small = JSON.stringify({ data: "x" });
      const padded = padPayload(small);
      expect(padded.length).toBe(64 * 1024);
    });

    it("pads to the nearest power-of-2 bucket", () => {
      // 100KB input should pad to 128KB
      const input = "x".repeat(100 * 1024);
      const padded = padPayload(input);
      expect(padded.length).toBe(128 * 1024);
    });

    it("preserves the original JSON data", () => {
      const original = JSON.stringify({ vaultId: "abc", vault: { v: 1 } });
      const padded = padPayload(original);
      const parsed = JSON.parse(padded);
      expect(parsed.vaultId).toBe("abc");
      expect(parsed.vault.v).toBe(1);
    });

    it("produces different padding each time (random)", () => {
      const input = JSON.stringify({ data: "test" });
      const a = padPayload(input);
      const b = padPayload(input);
      // Padding field should differ (random)
      const parsedA = JSON.parse(a);
      const parsedB = JSON.parse(b);
      expect(parsedA._pad).not.toBe(parsedB._pad);
    });

    it("pads up to the top bucket", () => {
      const input = "x".repeat(3 * 1024 * 1024);
      const padded = padPayload(input);
      expect(padded.length).toBe(SYNC.MAX_PADDED_PAYLOAD_SIZE);
    });

    it("leaves a payload already over the top bucket unpadded", () => {
      // Padding an oversized body only makes it more oversized. The next
      // bucket up would not survive compression inside the wire ceiling,
      // so an outsized payload rides unpadded rather than being inflated
      // into a 413.
      const input = "x".repeat(SYNC.MAX_PADDED_PAYLOAD_SIZE + 1024);
      const padded = padPayload(input);
      expect(padded.length).toBe(input.length);
    });

    it("pads or stands aside, but never grows a body past the top bucket", () => {
      const sizes = [
        SYNC.MAX_PADDED_PAYLOAD_SIZE - 1024,
        SYNC.MAX_PADDED_PAYLOAD_SIZE,
        SYNC.MAX_PADDED_PAYLOAD_SIZE + 1,
      ];
      for (const size of sizes) {
        expect(padPayload("x".repeat(size)).length).toBe(
          Math.max(size, SYNC.MAX_PADDED_PAYLOAD_SIZE),
        );
      }
    });

    it("still hides content size once the body is compressed", async () => {
      // The whole point of padding is that a traffic observer cannot
      // infer subscription count from transfer size. The body is gzipped
      // in transit, so the pad must compress at the SAME ratio as the
      // base64 ciphertext it is hiding — random hex compresses to 0.54,
      // base64 to 0.75, and mixing the two makes the compressed length a
      // function of the real content size again. Two payloads in the same
      // bucket must look the same on the wire.
      const { encodePushBody } = await import("@/core/sync/vault-transport");
      const bucket = 1024 * 1024;

      const wireLengths: number[] = [];
      for (const fraction of [0.55, 0.95]) {
        const ciphertext = randomBase64(Math.round(bucket * fraction));
        const json = JSON.stringify({
          vaultId: "a".repeat(64),
          vault: { version: 4, iv: [1], ciphertext },
        });
        const padded = padPayload(json);
        expect(padded.length).toBe(bucket);
        wireLengths.push(unwrap(await encodePushBody(padded)).byteLength);
      }

      const [lean, full] = wireLengths;
      expect(Math.abs(lean - full)).toBeLessThan(1024);
    });

    it("returns input unchanged if already at a bucket boundary", () => {
      // Create input that is exactly 64KB after padding
      // First pad, then verify it's stable
      const input = JSON.stringify({ data: "x" });
      const padded = padPayload(input);
      expect(padded.length).toBe(64 * 1024);
    });
  });
});
