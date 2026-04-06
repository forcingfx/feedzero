// src/core/favicon/favicon-resolver.ts
var WELL_KNOWN_PATHS = [
  "/favicon.ico",
  "/favicon.png",
  "/apple-touch-icon.png"
];
var ICON_LINK_RE = /<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*>/gi;
var HREF_RE = /href=["']([^"']+)["']/i;
var SIZES_RE = /sizes=["']([^"']+)["']/i;
async function resolveIconUrl(origin) {
  const wellKnown = await tryWellKnownPaths(origin);
  if (wellKnown) return wellKnown;
  const htmlIcon = await tryHtmlParsing(origin);
  if (htmlIcon) return htmlIcon;
  return duckDuckGoFallback(origin);
}
async function tryWellKnownPaths(origin) {
  for (const path of WELL_KNOWN_PATHS) {
    const url = origin + path;
    try {
      const res = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": "FeedZero/1.0 (RSS Reader)" },
        signal: AbortSignal.timeout(5e3)
      });
      if (res.ok && isImageResponse(res)) return url;
    } catch {
    }
  }
  return null;
}
var MIN_ICON_BYTES = 500;
function isImageResponse(res) {
  const ct = res.headers.get("content-type") ?? "";
  const cl = res.headers.get("content-length");
  if (!ct.startsWith("image/")) return false;
  if (cl && parseInt(cl) < MIN_ICON_BYTES) return false;
  return true;
}
async function tryHtmlParsing(origin) {
  try {
    const res = await fetch(origin, {
      headers: { "User-Agent": "FeedZero/1.0 (RSS Reader)" },
      signal: AbortSignal.timeout(5e3)
    });
    if (!res.ok) return null;
    const html = await res.text();
    return pickBestIcon(html, origin);
  } catch {
    return null;
  }
}
function pickBestIcon(html, origin) {
  const candidates = [];
  let match;
  while ((match = ICON_LINK_RE.exec(html)) !== null) {
    const tag = match[0];
    const hrefMatch = HREF_RE.exec(tag);
    if (!hrefMatch) continue;
    const rawHref = hrefMatch[1];
    const href = resolveUrl(rawHref, origin);
    if (!href) continue;
    const sizesMatch = SIZES_RE.exec(tag);
    const size = sizesMatch ? parseSize(sizesMatch[1]) : 0;
    candidates.push({ href, size });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.size - a.size);
  return candidates[0].href;
}
function parseSize(sizes) {
  const match = /(\d+)x(\d+)/.exec(sizes);
  return match ? parseInt(match[1]) : 0;
}
function resolveUrl(href, origin) {
  try {
    return new URL(href, origin).href;
  } catch {
    return null;
  }
}
function duckDuckGoFallback(origin) {
  const host = new URL(origin).host;
  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
}

// src/utils/result.ts
function ok(value) {
  return { ok: true, value };
}
function err(error) {
  return { ok: false, error };
}

// src/core/proxy/validate-url.ts
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
function extractMappedIPv4(hostname) {
  const dotted = hostname.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (dotted) return dotted[1];
  const hex = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return `${high >> 8 & 255}.${high & 255}.${low >> 8 & 255}.${low & 255}`;
  }
  return null;
}
function isPrivateIPv4(ip) {
  return BLOCKED_HOSTNAMES.has(ip) || BLOCKED_PREFIXES.some((prefix) => ip.startsWith(prefix)) || isPrivate172(ip);
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
  const rawHostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const ipToCheck = extractMappedIPv4(rawHostname) ?? rawHostname;
  if (isPrivateIPv4(ipToCheck)) {
    return err("Access to internal addresses is blocked");
  }
  return ok(parsed);
}

// src/core/favicon/favicon-handler.ts
async function handleFaviconRequest(req) {
  const url = new URL(req.url, "http://localhost");
  const domain = url.searchParams.get("domain");
  if (!domain) {
    return new Response("Missing domain parameter", { status: 400 });
  }
  const origin = `https://${domain}`;
  const validation = validateProxyUrl(origin);
  if (!validation.ok) {
    return new Response(validation.error, { status: 400 });
  }
  try {
    const iconUrl = await resolveIconUrl(origin);
    const res = await fetch(iconUrl, {
      headers: { "User-Agent": "FeedZero/1.0 (RSS Reader)" },
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) {
      return new Response("Favicon not found", { status: 404 });
    }
    const body = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "image/x-icon";
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache"
      }
    });
  } catch {
    return new Response("Favicon fetch failed", { status: 502 });
  }
}

// api/favicon.ts
async function GET(req) {
  return handleFaviconRequest(req);
}
export {
  GET
};
