import type { PaywallDetector, PaywallVerdict } from "./types.ts";

/**
 * The Economist paywall detector. Matches the recurring CTA strings shown
 * inside the subscribe block on `economist.com` (and its `www.` subdomain).
 * As with NYT, we keep the phrase list small and high-confidence — false
 * positives surface as "Authorize <publisher>" prompts on free articles,
 * which is a worse UX than a missed gate.
 */
const ECONOMIST_PHRASES = [
  "subscribe to the economist",
  "to continue reading this article you need to subscribe",
  "subscribe to continue",
  "get unlimited access to economist.com",
];

const ECONOMIST_HOST_SUFFIXES = ["economist.com"];

function isEconomistHost(host: string): boolean {
  return ECONOMIST_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export const economistDetector: PaywallDetector = {
  name: "economist",
  publisher: "economist.com",
  matches(url) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return isEconomistHost(host);
    } catch {
      return false;
    }
  },
  detect(html): PaywallVerdict {
    const lower = html.toLowerCase();
    for (const phrase of ECONOMIST_PHRASES) {
      if (lower.includes(phrase)) {
        return {
          paywalled: true,
          publisher: "economist.com",
          reason: "economist-cta",
        };
      }
    }
    return { paywalled: false, publisher: "economist.com" };
  },
};
