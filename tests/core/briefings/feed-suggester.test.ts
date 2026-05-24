import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock discoverFeed at the discovery module so the suggester is exercised
// without making real network calls.
const discoverMock = vi.hoisted(() => vi.fn());

vi.mock("@/core/discovery/discovery", () => ({
  discoverFeed: discoverMock,
}));

import { resolveSuggestedFeeds } from "@/core/briefings/feed-suggester";
import type { SuggestedFeed } from "@feedzero/core/types";

function suggestion(over: Partial<SuggestedFeed> = {}): SuggestedFeed {
  return {
    candidateUrl: over.candidateUrl ?? "https://example.com/x",
    rationale: over.rationale ?? "Relevant source",
    discoveryStatus: over.discoveryStatus ?? "pending",
    resolvedFeedUrl: over.resolvedFeedUrl,
    resolvedTitle: over.resolvedTitle,
  };
}

function discoveryOk(feedUrl: string, title: string) {
  return {
    ok: true as const,
    value: {
      feedUrl,
      feed: { title, description: "", siteUrl: "", url: feedUrl },
      articles: [],
    },
  };
}

describe("resolveSuggestedFeeds", () => {
  beforeEach(() => {
    discoverMock.mockReset();
  });

  it("returns an empty array when given no suggestions", async () => {
    const resolved = await resolveSuggestedFeeds([]);
    expect(resolved).toEqual([]);
    expect(discoverMock).not.toHaveBeenCalled();
  });

  it("marks a successful discovery as resolved with the discovered feedUrl and title", async () => {
    discoverMock.mockResolvedValueOnce(
      discoveryOk("https://example.com/feed.xml", "Example Daily"),
    );
    const [resolved] = await resolveSuggestedFeeds([
      suggestion({ candidateUrl: "https://example.com" }),
    ]);
    expect(resolved.discoveryStatus).toBe("resolved");
    expect(resolved.resolvedFeedUrl).toBe("https://example.com/feed.xml");
    expect(resolved.resolvedTitle).toBe("Example Daily");
    expect(resolved.rationale).toBe("Relevant source");
  });

  it("marks a discovery failure as unreachable, preserving the original metadata", async () => {
    discoverMock.mockResolvedValueOnce({ ok: false, error: "404 Not Found" });
    const [resolved] = await resolveSuggestedFeeds([
      suggestion({
        candidateUrl: "https://hallucinated-site.example/feed.xml",
        rationale: "Made-up source",
      }),
    ]);
    expect(resolved.discoveryStatus).toBe("unreachable");
    expect(resolved.resolvedFeedUrl).toBeUndefined();
    expect(resolved.candidateUrl).toBe(
      "https://hallucinated-site.example/feed.xml",
    );
    expect(resolved.rationale).toBe("Made-up source");
  });

  it("treats a thrown error from discoverFeed as unreachable (doesn't break the batch)", async () => {
    discoverMock.mockRejectedValueOnce(new Error("network kaput"));
    discoverMock.mockResolvedValueOnce(
      discoveryOk("https://b.example/feed.xml", "B"),
    );
    const resolved = await resolveSuggestedFeeds([
      suggestion({ candidateUrl: "https://a.example" }),
      suggestion({ candidateUrl: "https://b.example" }),
    ]);
    expect(resolved[0].discoveryStatus).toBe("unreachable");
    expect(resolved[1].discoveryStatus).toBe("resolved");
  });

  it("preserves the input order across resolution", async () => {
    discoverMock
      .mockResolvedValueOnce(
        discoveryOk("https://1.example/feed.xml", "One"),
      )
      .mockResolvedValueOnce(
        discoveryOk("https://2.example/feed.xml", "Two"),
      )
      .mockResolvedValueOnce(
        discoveryOk("https://3.example/feed.xml", "Three"),
      );
    const resolved = await resolveSuggestedFeeds([
      suggestion({ candidateUrl: "https://1.example" }),
      suggestion({ candidateUrl: "https://2.example" }),
      suggestion({ candidateUrl: "https://3.example" }),
    ]);
    expect(resolved.map((r) => r.resolvedTitle)).toEqual([
      "One",
      "Two",
      "Three",
    ]);
  });

  it("skips suggestions that already have a non-pending status (idempotent)", async () => {
    const already: SuggestedFeed = suggestion({
      candidateUrl: "https://example.com",
      discoveryStatus: "resolved",
      resolvedFeedUrl: "https://example.com/feed.xml",
      resolvedTitle: "Already Resolved",
    });
    const result = await resolveSuggestedFeeds([already]);
    expect(result[0]).toEqual(already);
    expect(discoverMock).not.toHaveBeenCalled();
  });

  it("passes the bridgesEnabled option through to discoverFeed", async () => {
    discoverMock.mockResolvedValueOnce(
      discoveryOk("https://yt.example/feed.xml", "Channel"),
    );
    await resolveSuggestedFeeds(
      [suggestion({ candidateUrl: "https://youtube.com/channel" })],
      { bridgesEnabled: true },
    );
    expect(discoverMock).toHaveBeenCalledWith(
      "https://youtube.com/channel",
      { bridges: true },
    );
  });
});
