import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearHostPauses,
  hostPausedUntil,
  recordHostPauseFromResponse,
  registerHostPause,
} from "@/core/feeds/host-pause";

describe("host-pause", () => {
  beforeEach(() => clearHostPauses());
  afterEach(() => clearHostPauses());

  describe("registerHostPause / hostPausedUntil", () => {
    it("returns null when the host has never been paused", () => {
      expect(hostPausedUntil("https://example.com/feed.xml", 1000)).toBeNull();
    });

    it("returns the pause expiry when the host was just paused", () => {
      registerHostPause("https://example.com/feed.xml", 5000);
      expect(hostPausedUntil("https://example.com/feed.xml", 1000)).toBe(5000);
    });

    it("matches any URL on the same host", () => {
      // A 429 on /a.xml should also gate /b.xml — the rate limit is at the
      // host, not the path. This is the whole reason to pause-by-host.
      registerHostPause("https://example.com/a.xml", 5000);
      expect(hostPausedUntil("https://example.com/b.xml", 1000)).toBe(5000);
    });

    it("does NOT match a different host", () => {
      registerHostPause("https://example.com/a.xml", 5000);
      expect(hostPausedUntil("https://other.com/feed.xml", 1000)).toBeNull();
    });

    it("returns null after the pause expires", () => {
      registerHostPause("https://example.com/feed.xml", 5000);
      expect(hostPausedUntil("https://example.com/feed.xml", 5001)).toBeNull();
    });

    it("only extends a pause, never shortens it", () => {
      // Two refreshes return Retry-After: 60s and 10s back-to-back. The
      // longer pause wins so we don't undercut the upstream's signal.
      registerHostPause("https://example.com/a.xml", 60_000);
      registerHostPause("https://example.com/b.xml", 10_000);
      expect(hostPausedUntil("https://example.com/feed.xml", 0)).toBe(60_000);
    });

    it("ignores URLs that fail to parse (no pause recorded)", () => {
      registerHostPause("not a url", 5000);
      // Nothing was recorded — the lookup for the original string should
      // also return null.
      expect(hostPausedUntil("not a url", 1000)).toBeNull();
    });
  });

  describe("recordHostPauseFromResponse", () => {
    function makeResponse(status: number, retryAfter: string | null) {
      return {
        status,
        headers: { get: (key: string) => (key.toLowerCase() === "retry-after" ? retryAfter : null) },
      };
    }

    it("records a pause for a 429 with delta-seconds Retry-After", () => {
      recordHostPauseFromResponse(
        "https://example.com/feed.xml",
        makeResponse(429, "60"),
        1000,
      );
      expect(hostPausedUntil("https://example.com/feed.xml", 1000)).toBe(
        61_000,
      );
    });

    it("records a pause for a 503 with HTTP-date Retry-After", () => {
      const date = new Date("2026-06-01T00:01:00.000Z").toUTCString();
      const now = new Date("2026-06-01T00:00:00.000Z").getTime();
      recordHostPauseFromResponse(
        "https://example.com/feed.xml",
        makeResponse(503, date),
        now,
      );
      const until = hostPausedUntil("https://example.com/feed.xml", now);
      expect(until).not.toBeNull();
      expect(until!).toBeGreaterThan(now);
    });

    it("does not pause for a 200 even if a Retry-After header is present", () => {
      // Retry-After is only meaningful on 429/503 (RFC 7231). Pausing on
      // success would be silly.
      recordHostPauseFromResponse(
        "https://example.com/feed.xml",
        makeResponse(200, "60"),
        1000,
      );
      expect(hostPausedUntil("https://example.com/feed.xml", 1000)).toBeNull();
    });

    it("does not pause when a 429 has no Retry-After header", () => {
      // The proxy / rate-limiter contract requires Retry-After on 429s.
      // If the upstream omitted it, we don't invent a delay — fall through
      // to the normal error path.
      recordHostPauseFromResponse(
        "https://example.com/feed.xml",
        makeResponse(429, null),
        1000,
      );
      expect(hostPausedUntil("https://example.com/feed.xml", 1000)).toBeNull();
    });
  });
});
