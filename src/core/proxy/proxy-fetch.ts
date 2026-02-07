/**
 * Fetch a URL via the CORS proxy using POST to keep target URLs
 * out of server access logs and browser history.
 */
export async function proxyFetch(
  endpoint: string,
  targetUrl: string,
): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: targetUrl }),
  });
}
