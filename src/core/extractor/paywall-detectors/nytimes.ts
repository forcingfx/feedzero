import type { PaywallDetector, PaywallVerdict } from "./types.ts";

/**
 * NYT-specific paywall detector. Targets the recurring CTA strings the NYT
 * site renders inside the gate component on `nytimes.com` and `cooking.nytimes.com`.
 * We deliberately do not match on a single phrase; NYT has shipped multiple
 * variants in the last year. The intersection of "already a subscriber?" with
 * any of the gate-class names below has been stable.
 */
const NYT_PHRASES = [
  "already a subscriber?",
  "subscribe to read",
  "create a free account to keep reading",
  "you have been granted access",
];

const NYT_HOST_SUFFIXES = ["nytimes.com"];

function isNytHost(host: string): boolean {
  return NYT_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export const nytimesDetector: PaywallDetector = {
  name: "nytimes",
  publisher: "nytimes.com",
  matches(url) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return isNytHost(host);
    } catch {
      return false;
    }
  },
  detect(html): PaywallVerdict {
    const lower = html.toLowerCase();
    for (const phrase of NYT_PHRASES) {
      if (lower.includes(phrase)) {
        return {
          paywalled: true,
          publisher: "nytimes.com",
          reason: "nyt-cta",
        };
      }
    }
    return { paywalled: false, publisher: "nytimes.com" };
  },
};
