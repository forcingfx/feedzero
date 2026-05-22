import type { Bridge } from "./types.ts";
import { proxyFetch } from "../proxy/proxy-fetch.ts";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
]);

// /channel/UC… (resolvable without a fetch), or /@handle, /c/name, /user/name
// (need the page HTML to recover the opaque channel id).
const YOUTUBE_PATH = /^\/(channel\/UC[\w-]+|@[^/]+|c\/[^/]+|user\/[^/]+)\/?$/;

function feedFromChannelId(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

/**
 * Recover a YouTube channel id (UC…) from a channel page's HTML. YouTube
 * embeds it in several places; we try the structured `"channelId":"UC…"`
 * JSON field first, then the `/channel/UC…` canonical href as a fallback.
 * Pure — exported for unit testing without a network round-trip.
 */
export function extractYouTubeChannelId(html: string): string | null {
  const json = html.match(/"(?:externalId|channelId)"\s*:\s*"(UC[\w-]+)"/);
  if (json) return json[1];
  const href = html.match(/\/channel\/(UC[\w-]+)/);
  return href ? href[1] : null;
}

export const youtubeBridge: Bridge = {
  name: "youtube",
  matches(url) {
    if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return false;
    return YOUTUBE_PATH.test(url.pathname);
  },
  async toFeedUrl(url) {
    const direct = url.pathname.match(/^\/channel\/(UC[\w-]+)/);
    if (direct) return feedFromChannelId(direct[1]);

    // @handle / c/ / user/ — fetch the page and recover the channel id.
    try {
      const response = await proxyFetch("/api/page", url.href);
      if (!response.ok) return null;
      const html = await response.text();
      const channelId = extractYouTubeChannelId(html);
      return channelId ? feedFromChannelId(channelId) : null;
    } catch {
      return null;
    }
  },
};
