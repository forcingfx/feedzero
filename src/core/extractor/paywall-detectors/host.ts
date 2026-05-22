/**
 * Extract a canonical publisher host (no leading "www.") from a URL string.
 * Returns null when the URL cannot be parsed; the reader pane should treat a
 * null publisher as "we cannot offer authorize-publisher UI for this article"
 * and fall back to the install-extension prompt.
 */
export function publisherHost(rawUrl: string): string | null {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}
