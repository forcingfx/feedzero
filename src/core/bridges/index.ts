import { bridgeRegistry } from "./registry.ts";
import { redditBridge } from "./reddit.ts";
import { githubBridge } from "./github.ts";
import { youtubeBridge } from "./youtube.ts";
import { mastodonBridge } from "./mastodon.ts";

// Order: host-scoped bridges first; mastodon last because its `/@user`
// matcher is host-agnostic and would otherwise shadow youtube's `/@handle`.
bridgeRegistry.register(redditBridge);
bridgeRegistry.register(githubBridge);
bridgeRegistry.register(youtubeBridge);
bridgeRegistry.register(mastodonBridge);

/**
 * Translate a source URL into a native feed URL, or null when no bridge
 * recognises it. The discovery cascade calls this as "strategy 0" and
 * validates the result with tryParseFeed, so the returned URL is a
 * *candidate*, not a guarantee.
 */
export async function resolveBridgeFeedUrl(
  rawUrl: string,
): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const bridge = bridgeRegistry.find(url);
  if (!bridge) return null;
  return bridge.toFeedUrl(url);
}

export { extractYouTubeChannelId } from "./youtube.ts";
export type { Bridge } from "./types.ts";
