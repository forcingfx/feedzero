/**
 * Helpers for the Vite dev-server API proxy plugin.
 *
 * Extracted from vite.config.js so the request/response translation can be
 * unit-tested independently of running the full Vite server. The dev-proxy
 * has historically been a source of bugs that only surface end-to-end (e.g.
 * the Stripe webhook signature dropped because Content-Type was the only
 * header forwarded). Pinning these helpers in tests/scripts/dev-proxy.test.ts
 * catches that class of regression locally rather than in a manual smoke run.
 */

/**
 * Convert a Node IncomingMessage to a Web standard Request.
 *
 * Forwards every request header (with HTTP/2 pseudo-headers like `:path`
 * skipped because the Web Request constructor rejects them). The body is
 * read and re-attached for non-GET/HEAD methods so handlers can call
 * `request.text()` / `request.json()` once.
 */
export async function toWebRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bodyStr = Buffer.concat(chunks).toString();

  const url = new URL(req.url, "http://localhost");
  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (name.startsWith(":")) continue;
    if (Array.isArray(value)) headers[name] = value.join(", ");
    else if (typeof value === "string") headers[name] = value;
  }

  return new Request(url, {
    method: req.method,
    headers,
    ...(hasBody ? { body: bodyStr } : {}),
  });
}

/**
 * Pipe a Web standard Response into a Node ServerResponse.
 */
export async function sendWebResponse(webRes, res) {
  res.statusCode = webRes.status;
  for (const [key, value] of webRes.headers.entries()) {
    res.setHeader(key, value);
  }
  res.end(Buffer.from(await webRes.arrayBuffer()));
}
