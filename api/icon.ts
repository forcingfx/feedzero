// api/icon.ts
function ok(value) {
  return { ok: true, value };
}
function err(error) {
  return { ok: false, error };
}
var BLOCKED_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "169.254.169.254"
]);
var BLOCKED_PREFIXES = ["10.", "192.168."];
function isPrivate172(hostname) {
  const match = hostname.match(/^172\.(\d+)\./);
  if (!match) return false;
  const octet = parseInt(match[1], 10);
  return octet >= 16 && octet <= 31;
}
function validateProxyUrl(url) {
  if (!url) {
    return err("Missing url parameter");
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return err("Invalid URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return err("Only http and https URLs are allowed");
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_PREFIXES.some((prefix) => hostname.startsWith(prefix)) || isPrivate172(hostname)) {
    return err("Access to internal addresses is blocked");
  }
  return ok(parsed);
}
async function handleProxyRequest(req, defaultContentType) {
  const url = new URL(req.url, "http://localhost");
  const target = url.searchParams.get("url");
  const validation = validateProxyUrl(target);
  if (!validation.ok) {
    const status = validation.error === "Access to internal addresses is blocked" ? 403 : 400;
    return new Response(validation.error, { status });
  }
  try {
    const response = await fetch(validation.value.href);
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || defaultContentType
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(`Proxy error: ${message}`, { status: 502 });
  }
}
async function GET(req) {
  return handleProxyRequest(req, "image/x-icon");
}
export {
  GET
};
