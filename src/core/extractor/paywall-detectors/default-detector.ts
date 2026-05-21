import type { PaywallDetector, PaywallVerdict } from "./types.ts";
import { publisherHost } from "./host.ts";
import { visibleTextLength } from "./visible-text.ts";

/**
 * Phrases that publishers across the industry use in their paywall stubs.
 * The list is conservative — false positives turn a free article into a
 * "we think this is paywalled" prompt, which is a worse UX than missing a
 * gate. Case-insensitive substring match.
 */
const PAYWALL_PHRASES = [
  "subscribe to read",
  "subscribe to continue",
  "already a subscriber?",
  "this article is for subscribers",
  "this story is for subscribers",
  "to continue reading this article",
  "create a free account to keep reading",
];

/**
 * Below this many visible characters, the page is almost certainly a stub
 * rather than the full article. Default-detector threshold only; individual
 * publisher detectors may use their own.
 */
const MIN_BODY_LENGTH = 600;

export const defaultDetector: PaywallDetector = {
  name: "default",
  publisher: null,
  matches: () => true,
  detect(html, url): PaywallVerdict {
    const publisher = publisherHost(url);
    const lower = html.toLowerCase();
    for (const phrase of PAYWALL_PHRASES) {
      if (lower.includes(phrase)) {
        return { paywalled: true, publisher, reason: "phrase-match" };
      }
    }
    if (visibleTextLength(html) < MIN_BODY_LENGTH) {
      return { paywalled: true, publisher, reason: "body-too-short" };
    }
    return { paywalled: false, publisher };
  },
};
