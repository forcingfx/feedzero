import type { Bridge } from "./types.ts";

// Mastodon is federated, so we can't allowlist hosts. Instead we denylist
// the well-known platforms that ALSO use a `/@user` path shape but are not
// Mastodon (so we don't emit a bogus `.rss` candidate for them). A wrong
// guess would still be caught by tryParseFeed; this just avoids the wasted
// fetch for the common collisions.
const NON_MASTODON_HOSTS = new Set([
  "medium.com",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "twitter.com",
  "x.com",
  "github.com",
  "www.github.com",
]);

// A single `/@handle` segment, optional trailing slash.
const MASTODON_PATH = /^\/@[^/]+\/?$/;

export const mastodonBridge: Bridge = {
  name: "mastodon",
  matches(url) {
    if (NON_MASTODON_HOSTS.has(url.hostname.toLowerCase())) return false;
    return MASTODON_PATH.test(url.pathname);
  },
  async toFeedUrl(url) {
    const handle = url.pathname.replace(/\/$/, "");
    return `${url.origin}${handle}.rss`;
  },
};
