import type { PaywallDetector } from "./types.ts";

/**
 * Ordered registry of paywall detectors. Order matters: the first detector
 * whose `matches(url)` returns true gets to make the call. Default detector
 * is registered last and matches every URL.
 */
class PaywallDetectorRegistry {
  private detectors: PaywallDetector[] = [];

  register(detector: PaywallDetector): void {
    this.detectors.push(detector);
  }

  findDetector(url: string): PaywallDetector | null {
    for (const detector of this.detectors) {
      if (detector.matches(url)) return detector;
    }
    return null;
  }
}

export const paywallRegistry = new PaywallDetectorRegistry();
