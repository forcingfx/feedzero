// @ts-nocheck
// api/briefing.ts
var ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
var FORWARDED_HEADERS = [
  "x-api-key",
  "anthropic-version",
  "anthropic-beta",
  "content-type"
];
async function handleBriefingRequest(request) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return jsonResponse(
      { error: "Missing x-api-key header" },
      401
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
  if (!forwardHeaders.has("anthropic-version")) {
    forwardHeaders.set("anthropic-version", "2023-06-01");
  }
  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: forwardHeaders,
      body
    });
  } catch (e) {
    return jsonResponse(
      {
        error: `Couldn't reach Anthropic: ${e instanceof Error ? e.message : String(e)}`
      },
      502
    );
  }
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
    headers: responseHeaders
  });
}
function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
async function POST(req) {
  return handleBriefingRequest(req);
}
export {
  POST
};
