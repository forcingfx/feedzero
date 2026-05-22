import type { Bridge } from "./types.ts";

const REDDIT_HOSTS = new Set([
  "reddit.com",
  "www.reddit.com",
  "old.reddit.com",
  "np.reddit.com",
]);

// /r/<sub>, /user/<u>, or the /u/<u> shorthand — single path segment after
// the prefix, optional trailing slash.
const REDDIT_PATH = /^\/(r|u|user)\/[^/]+\/?$/;

export const redditBridge: Bridge = {
  name: "reddit",
  matches(url) {
    if (!REDDIT_HOSTS.has(url.hostname.toLowerCase())) return false;
    return REDDIT_PATH.test(url.pathname);
  },
  async toFeedUrl(url) {
    // Normalise /u/ → /user/ (Reddit redirects it, but emitting the
    // canonical form avoids a redirect hop) and append /.rss.
    const path = url.pathname.replace(/\/$/, "").replace(/^\/u\//, "/user/");
    return `https://www.reddit.com${path}/.rss`;
  },
};
