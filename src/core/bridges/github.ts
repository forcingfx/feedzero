import type { Bridge } from "./types.ts";

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

// Top-level paths that look like /<owner>/<repo> but aren't repositories.
const RESERVED_OWNERS = new Set([
  "features",
  "about",
  "pricing",
  "marketplace",
  "sponsors",
  "topics",
  "collections",
  "trending",
  "settings",
  "notifications",
  "explore",
  "orgs",
  "organizations",
  "users",
  "login",
  "join",
  "new",
  "search",
  "apps",
]);

export const githubBridge: Bridge = {
  name: "github",
  matches(url) {
    if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) return false;
    const segs = url.pathname.split("/").filter(Boolean);
    if (segs.length !== 2) return false;
    if (RESERVED_OWNERS.has(segs[0].toLowerCase())) return false;
    return true;
  },
  async toFeedUrl(url) {
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    // Releases is the highest-signal default — most repos a user follows
    // they follow for releases, not every commit.
    return `https://github.com/${owner}/${repo.replace(/\.git$/, "")}/releases.atom`;
  },
};
