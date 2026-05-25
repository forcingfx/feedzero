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

  it("uses a browser UA for page fetches even on hosted deployments", () => {
    // /api/page fetches are user-initiated, one-off article requests that
    // should look like a regular browser visit. The FeedZero identifier
    // is widely blocked by WAFs on article URLs (vs feed URLs where bot
    // traffic is expected), so page fetches use a browser UA by default.
    const ua = pickUserAgent({}, "page");
    expect(ua).not.toBe(DEFAULT_USER_AGENT);
    expect(ua).toMatch(/Mozilla/);
  });

  it("FEED_USER_AGENT overrides the page-route browser default", () => {
    // Operators who set FEED_USER_AGENT get the final word for every route.
    expect(
      pickUserAgent({ FEED_USER_AGENT: "Custom/1.0" }, "page"),
    ).toBe("Custom/1.0");
  });

  it("defaults the route kind to feed when omitted (back-compat)", () => {
    expect(pickUserAgent({})).toBe(DEFAULT_USER_AGENT);
  });
});
