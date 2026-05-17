import { describe, it, expect } from "vitest";
import { pickUserAgent, DEFAULT_USER_AGENT } from "@/core/proxy/pick-user-agent";

describe("pickUserAgent", () => {
  it("defaults to the FeedZero identifier on hosted deployments", () => {
    // The Vercel deployment retains the honest UA so upstream operators
    // can see FeedZero in their logs. Only self-hosters get the browser UA.
    expect(pickUserAgent({})).toBe(DEFAULT_USER_AGENT);
  });

  it("honors FEED_USER_AGENT when explicitly set", () => {
    // An operator who wants to forward a different identifier (their own
    // reader name, contact email, etc.) gets the final word.
    const custom = "MyReader/2.0 (+https://example.com/contact)";
    expect(pickUserAgent({ FEED_USER_AGENT: custom })).toBe(custom);
  });

  it("returns a browser-like UA when SELF_HOSTED=1 and no override is set", () => {
    // Self-hosters represent a single user, not a fleet. A browser UA is
    // an honest description of the request profile and avoids
    // Cloudflare-class WAFs that block the FeedZero identifier on
    // sight (see feedback #97).
    const ua = pickUserAgent({ SELF_HOSTED: "1" });
    expect(ua).not.toBe(DEFAULT_USER_AGENT);
    expect(ua).toMatch(/Mozilla/);
  });

  it("FEED_USER_AGENT wins over SELF_HOSTED=1", () => {
    expect(
      pickUserAgent({ SELF_HOSTED: "1", FEED_USER_AGENT: "Custom/1.0" }),
    ).toBe("Custom/1.0");
  });
});
