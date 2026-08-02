/**
 * Paywall support types + helpers for the reader's authenticated-fetch flow.
 *
 * FeedZero no longer guesses at paywalls from page content. The only paywall
 * signal we trust is the publisher's own HTTP response: an anonymous fetch
 * that comes back 401/402/403/451 IS gated. Content heuristics (phrase lists,
 * body-length thresholds) were removed because they false-positived on free
 * articles whose chrome shipped industry-standard "Subscribe" CTAs (issue
 * #211) — a worse UX than missing a gate. See ADR 028.
 *
 * A verdict therefore only ever exists when the article is gated; presence in
 * the store's `paywallMap` is itself the signal.
 */
export interface PaywallVerdict {
  /** Always true — a verdict is only recorded for a gated article. */
  paywalled: true;
  /** Canonical publisher host (e.g. "nytimes.com"); null when unparseable. */
  publisher: string | null;
  /** Why we gated: `http-<status>` or `session-expired`. */
  reason: string;
}

/**
 * Extract a canonical publisher host (no leading "www.") from a URL string.
 * Returns null when the URL cannot be parsed; the reader pane treats a null
 * publisher as "we cannot offer authorize-publisher UI for this article" and
 * falls back to the install-extension / open-original prompt.
 */
export function publisherHost(rawUrl: string): string | null {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}
