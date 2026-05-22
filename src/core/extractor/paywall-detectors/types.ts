/**
 * A paywall detector inspects fetched HTML and decides whether the article
 * appears gated. Detectors are pure functions — no DOM, no network — so the
 * same module runs in the web app, in tests, and (someday) in a service
 * worker without a window.
 *
 * Each detector either claims a URL via `matches(url)` or punts to the next
 * one in the chain. The default detector matches every URL and runs as a
 * fallback after publisher-specific detectors decline.
 */

export type PaywallVerdict =
  | {
      paywalled: false;
      publisher: string | null;
    }
  | {
      paywalled: true;
      publisher: string | null;
      reason: string;
    };

export interface PaywallDetector {
  /** Human-readable name for debugging. */
  name: string;
  /** Publisher-stable identifier returned in the verdict (e.g. "nytimes.com"). */
  publisher: string | null;
  /** Whether this detector claims responsibility for the given URL. */
  matches(url: string): boolean;
  /** Inspect the html; return a verdict. */
  detect(html: string, url: string): PaywallVerdict;
}
