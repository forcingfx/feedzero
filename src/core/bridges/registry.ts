import type { Bridge } from "./types.ts";

/**
 * Ordered registry of bridges. First match wins, so register the
 * narrow-host bridges (youtube, github) before the broad path matchers
 * (mastodon's `/@user`) — see index.ts.
 */
class BridgeRegistry {
  private bridges: Bridge[] = [];

  register(bridge: Bridge): void {
    this.bridges.push(bridge);
  }

  find(url: URL): Bridge | null {
    for (const bridge of this.bridges) {
      if (bridge.matches(url)) return bridge;
    }
    return null;
  }
}

export const bridgeRegistry = new BridgeRegistry();
