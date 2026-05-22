import { paywallRegistry } from "./registry.ts";
import { defaultDetector } from "./default-detector.ts";
import { nytimesDetector } from "./nytimes.ts";
import { economistDetector } from "./economist.ts";
import type { PaywallVerdict } from "./types.ts";

paywallRegistry.register(nytimesDetector);
paywallRegistry.register(economistDetector);
paywallRegistry.register(defaultDetector);

/**
 * Inspect fetched HTML for a paywall. Picks the first publisher-specific
 * detector that claims the URL; falls through to the default detector
 * otherwise. Returns a `PaywallVerdict` — see `./types.ts` for the shape.
 *
 * Caller (extraction-store) uses the verdict to decide:
 *   paywalled=false → render anonymous HTML as today
 *   paywalled=true  → ask the extension to refetch with credentials
 */
export function detectPaywall(html: string, url: string): PaywallVerdict {
  const detector = paywallRegistry.findDetector(url) ?? defaultDetector;
  return detector.detect(html, url);
}

export type { PaywallVerdict, PaywallDetector } from "./types.ts";
