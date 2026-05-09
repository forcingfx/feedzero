import { describe, it, expect } from "vitest";
import { formatRelative } from "../../src/lib/format-relative.ts";

const NOW = new Date("2026-05-09T12:00:00Z").getTime();

describe("formatRelative", () => {
  it("returns 'now' for very recent timestamps", () => {
    expect(formatRelative(NOW - 5 * 1000, NOW)).toBe("now");
  });

  it("returns minutes for sub-hour gaps", () => {
    expect(formatRelative(NOW - 5 * 60 * 1000, NOW)).toBe("5m ago");
    expect(formatRelative(NOW - 1 * 60 * 1000, NOW)).toBe("1m ago");
  });

  it("returns hours for sub-day gaps", () => {
    expect(formatRelative(NOW - 2 * 60 * 60 * 1000, NOW)).toBe("2h ago");
    expect(formatRelative(NOW - 23 * 60 * 60 * 1000, NOW)).toBe("23h ago");
  });

  it("returns 'yesterday' for ~1 day ago", () => {
    expect(formatRelative(NOW - 25 * 60 * 60 * 1000, NOW)).toBe("yesterday");
  });

  it("returns days for sub-week gaps", () => {
    expect(formatRelative(NOW - 3 * 24 * 60 * 60 * 1000, NOW)).toBe("3d ago");
  });

  it("returns absolute date string for older items", () => {
    const older = new Date("2026-03-15T12:00:00Z").getTime();
    expect(formatRelative(older, NOW)).toMatch(/Mar 15/);
  });

  it("returns empty string for falsy timestamps", () => {
    expect(formatRelative(0, NOW)).toBe("");
    expect(formatRelative(NaN, NOW)).toBe("");
  });

  it("handles future timestamps without going negative", () => {
    expect(formatRelative(NOW + 60 * 1000, NOW)).toBe("now");
  });
});
