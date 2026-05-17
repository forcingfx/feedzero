import { describe, it, expect } from "vitest";
import { parseRetryAfter } from "@/core/feeds/parse-retry-after";

describe("parseRetryAfter", () => {
  const NOW = new Date("2026-05-17T12:00:00Z").getTime();

  it("parses a delta-seconds integer", () => {
    // RFC 7231 §7.1.3 form 1: delta-seconds.
    expect(parseRetryAfter("60", NOW)).toBe(NOW + 60_000);
  });

  it("parses an HTTP-date string", () => {
    // RFC 7231 §7.1.3 form 2: HTTP-date. Some upstreams (notably nginx
    // and Apache mod_evasive) prefer this form.
    const future = new Date("2026-05-17T12:05:00Z").toUTCString();
    expect(parseRetryAfter(future, NOW)).toBe(NOW + 5 * 60_000);
  });

  it("clamps negative values to 0 (no time travel)", () => {
    // An HTTP-date in the past or a negative delta means "retry now."
    // Clamp to NOW so the pause window resolves immediately rather than
    // creating a permanent "paused since 1970" state.
    expect(parseRetryAfter("-30", NOW)).toBe(NOW);
    const past = new Date("2026-05-16T12:00:00Z").toUTCString();
    expect(parseRetryAfter(past, NOW)).toBe(NOW);
  });

  it("returns null for malformed input", () => {
    // Don't guess. If we can't parse it, the refresh worker treats this
    // as "no pause specified" and uses its default backoff instead.
    expect(parseRetryAfter("forever", NOW)).toBeNull();
    expect(parseRetryAfter("", NOW)).toBeNull();
    expect(parseRetryAfter(null, NOW)).toBeNull();
  });

  it("caps the pause at 24 hours (don't lose feeds to upstream typos)", () => {
    // A misconfigured upstream sending "Retry-After: 2592000" (30 days)
    // would otherwise silently disappear the feed for a month. Cap at
    // a day so the feed surfaces back in the rotation tomorrow.
    expect(parseRetryAfter("999999999", NOW)).toBe(NOW + 24 * 3600 * 1000);
  });
});
