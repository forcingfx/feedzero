/** Client-side timeout for proxy requests (ms). */
const PROXY_TIMEOUT = 20_000;

/**
 * Optional HTTP conditional-fetch validators. When the caller has
 * previously seen this URL it can pass back the upstream's `ETag` and
 * `Last-Modified` here; the proxy forwards them as `If-None-Match` /
 * `If-Modified-Since`, and the upstream may reply 304 (empty body)
 * instead of re-sending the full feed. The refresh path (feed-service)
 * uses this for every feed where the publisher set the headers on a
 * prior fetch — quiet feeds become near-zero-byte refreshes.
 */
export interface ProxyFetchOptions {
  etag?: string;
  lastModified?: string;
}

/**
 * Fetch a URL via the CORS proxy using POST to keep target URLs
 * out of server access logs and browser history.
 */
export async function proxyFetch(
  endpoint: string,
  targetUrl: string,
  options: ProxyFetchOptions = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT);
  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: targetUrl,
        ...(options.etag ? { etag: options.etag } : {}),
        ...(options.lastModified ? { lastModified: options.lastModified } : {}),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
