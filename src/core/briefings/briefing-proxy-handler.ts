/**
 * Shared handler: Anthropic relay for Signal Briefings.
 *
 * The browser POSTs a fully-formed Anthropic Messages request body
 * (model, system, tools, messages) and an `x-api-key` header carrying
 * the user's own Anthropic key. We forward to `api.anthropic.com/v1/messages`
 * verbatim and return Anthropic's response unchanged.
 *
 * Why this exists: iOS Safari (and other WebKit browsers) reject the
 * browser-direct call to api.anthropic.com — usually ITP classifying
 * Anthropic's Cloudflare cookie + permissive CORS as cross-site tracking.
 * The browser-direct architecture was infeasible for the iPad/iPhone
 * audience, so we relay through the same origin.
 *
 * Privacy contract (the price of supporting WebKit):
 *  - The user's API key transits this handler on every refresh.
 *  - The handler does NOT persist, log, or inspect the key, the prompt,
 *    or the article corpus — body bytes flow upstream, response bytes
 *    flow back, neither is touched.
 *  - Only Anthropic-specific headers cross the boundary; cookie /
 *    host / origin / referer / x-forwarded-* are stripped.
 *  - Outbound URL is hard-coded — no user-controlled URL parameter,
 *    so no SSRF risk like the feed proxy has.
 *
 * Trust model: the user has to trust the operator not to log; in
 * exchange the feature works in every browser. Self-hosters can audit
 * this file. See ADR 024 for the full reasoning.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/**
 * HTTP methods this handler accepts. Used by the routing contract test
 * in server.test.ts to enforce that the Hono server, the Vercel wrapper,
 * and the shared handler all agree on which methods are supported.
 */
export const SUPPORTED_METHODS: readonly string[] = ["POST"];

/**
 * Headers we deliberately forward to Anthropic. Whitelist (not
 * blocklist) so a future header we don't recognise can't sneak across
 * the trust boundary. `x-api-key` is required; the others are
 * Anthropic-defined and harmless if absent.
 */
const FORWARDED_HEADERS: readonly string[] = [
  "x-api-key",
  "anthropic-version",
  "anthropic-beta",
  "content-type",
];

export async function handleBriefingRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return jsonResponse(
      { error: "Missing x-api-key header" },
      401,
    );
  }

  const body = await request.text();
  if (!body) {
    return jsonResponse({ error: "Request body is required" }, 400);
  }

  const forwardHeaders = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) forwardHeaders.set(name, value);
  }
  // anthropic-version is required by the API; default if the client
  // forgot, so the relay still works for hand-curl-ed requests.
  if (!forwardHeaders.has("anthropic-version")) {
    forwardHeaders.set("anthropic-version", "2023-06-01");
  }

  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: forwardHeaders,
      body,
    });
  } catch (e) {
    return jsonResponse(
      {
        error: `Couldn't reach Anthropic: ${
          e instanceof Error ? e.message : String(e)
        }`,
      },
      502,
    );
  }

  // Forward the response as-is. Read the body as a buffer so the client
  // gets a clean Response (streaming would let upstream errors surface
  // mid-stream and complicate error mapping; non-streaming is fine
  // for briefing-sized payloads).
  const responseBody = await upstream.arrayBuffer();
  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);
  const requestId = upstream.headers.get("anthropic-request-id");
  if (requestId) responseHeaders.set("anthropic-request-id", requestId);
  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter) responseHeaders.set("retry-after", retryAfter);

  return new Response(responseBody, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
