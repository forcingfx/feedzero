import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  resolveBridgeFeedUrl,
  extractYouTubeChannelId,
} from "@/core/bridges/index.ts";
import { proxyFetch } from "@/core/proxy/proxy-fetch.ts";

vi.mock("@/core/proxy/proxy-fetch.ts", () => ({
  proxyFetch: vi.fn(),
}));

describe("resolveBridgeFeedUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("reddit", () => {
    it("maps a subreddit URL to its .rss feed", async () => {
      expect(await resolveBridgeFeedUrl("https://www.reddit.com/r/selfhosted")).toBe(
        "https://www.reddit.com/r/selfhosted/.rss",
      );
    });

    it("handles a trailing slash", async () => {
      expect(await resolveBridgeFeedUrl("https://reddit.com/r/rss/")).toBe(
        "https://www.reddit.com/r/rss/.rss",
      );
    });

    it("maps a /user/ profile URL", async () => {
      expect(await resolveBridgeFeedUrl("https://www.reddit.com/user/spez")).toBe(
        "https://www.reddit.com/user/spez/.rss",
      );
    });

    it("normalises the /u/ shorthand to /user/", async () => {
      expect(await resolveBridgeFeedUrl("https://www.reddit.com/u/spez")).toBe(
        "https://www.reddit.com/user/spez/.rss",
      );
    });

    it("does not match a deep comment URL", async () => {
      expect(
        await resolveBridgeFeedUrl(
          "https://www.reddit.com/r/selfhosted/comments/abc/title",
        ),
      ).toBeNull();
    });
  });

  describe("github", () => {
    it("maps a repo URL to its releases atom feed", async () => {
      expect(await resolveBridgeFeedUrl("https://github.com/forcingfx/feedzero")).toBe(
        "https://github.com/forcingfx/feedzero/releases.atom",
      );
    });

    it("strips a trailing .git", async () => {
      expect(await resolveBridgeFeedUrl("https://github.com/a/b.git")).toBe(
        "https://github.com/a/b/releases.atom",
      );
    });

    it("does not match a single-segment (owner-only) path", async () => {
      expect(await resolveBridgeFeedUrl("https://github.com/forcingfx")).toBeNull();
    });

    it("does not match a reserved path like /features", async () => {
      expect(await resolveBridgeFeedUrl("https://github.com/features/copilot")).toBeNull();
    });

    it("does not match a sub-page like /owner/repo/issues", async () => {
      expect(
        await resolveBridgeFeedUrl("https://github.com/forcingfx/feedzero/issues"),
      ).toBeNull();
    });
  });

  describe("mastodon", () => {
    it("maps a profile URL to its .rss feed on the same instance", async () => {
      expect(await resolveBridgeFeedUrl("https://mastodon.social/@Gargron")).toBe(
        "https://mastodon.social/@Gargron.rss",
      );
    });

    it("works for any instance host", async () => {
      expect(await resolveBridgeFeedUrl("https://fosstodon.org/@kev")).toBe(
        "https://fosstodon.org/@kev.rss",
      );
    });

    it("does not fire for medium.com/@user (not Mastodon)", async () => {
      expect(await resolveBridgeFeedUrl("https://medium.com/@someone")).toBeNull();
    });
  });

  describe("youtube", () => {
    it("maps a /channel/UC… URL directly without a fetch", async () => {
      const out = await resolveBridgeFeedUrl(
        "https://www.youtube.com/channel/UCXuqSBlHAE6Xw-yeJA0Tunw",
      );
      expect(out).toBe(
        "https://www.youtube.com/feeds/videos.xml?channel_id=UCXuqSBlHAE6Xw-yeJA0Tunw",
      );
      expect(proxyFetch).not.toHaveBeenCalled();
    });

    it("resolves an @handle by fetching the page and extracting the channelId", async () => {
      vi.mocked(proxyFetch).mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<html><body><meta itemprop="channelId" content="x">' +
              '<script>{"channelId":"UCabcdefghijklmnopqrstuv"}</script></body></html>',
          ),
      } as unknown as Response);

      const out = await resolveBridgeFeedUrl("https://www.youtube.com/@LinusTechTips");

      expect(out).toBe(
        "https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv",
      );
      expect(proxyFetch).toHaveBeenCalled();
    });

    it("returns null when the channelId cannot be found in the page", async () => {
      vi.mocked(proxyFetch).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html><body>no id here</body></html>"),
      } as unknown as Response);

      expect(
        await resolveBridgeFeedUrl("https://www.youtube.com/@whoever"),
      ).toBeNull();
    });
  });

  describe("no bridge match", () => {
    it("returns null for an unrelated URL", async () => {
      expect(await resolveBridgeFeedUrl("https://example.com/blog")).toBeNull();
    });

    it("returns null for an unparseable input", async () => {
      expect(await resolveBridgeFeedUrl("not a url")).toBeNull();
    });
  });
});

describe("extractYouTubeChannelId", () => {
  it("extracts from a channelId JSON field", () => {
    expect(
      extractYouTubeChannelId('foo {"channelId":"UCabcdefghijklmnopqrstuv"} bar'),
    ).toBe("UCabcdefghijklmnopqrstuv");
  });

  it("extracts from a /channel/UC… canonical href", () => {
    expect(
      extractYouTubeChannelId(
        '<link rel="canonical" href="https://www.youtube.com/channel/UCXuqSBlHAE6Xw-yeJA0Tunw">',
      ),
    ).toBe("UCXuqSBlHAE6Xw-yeJA0Tunw");
  });

  it("returns null when no id is present", () => {
    expect(extractYouTubeChannelId("<html></html>")).toBeNull();
  });
});
