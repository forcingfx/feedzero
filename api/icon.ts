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

// src/core/cleaner/tracker-stripper.ts
var TRACKER_DOMAINS = [
  "pixel.quantserve.com",
  "sb.scorecardresearch.com",
  "analytics.twitter.com",
  "www.google-analytics.com",
  "www.facebook.com/tr",
  "feeds.feedburner.com",
  "feeds.feedblitz.com",
  "stats.wordpress.com",
  "pixel.wp.com",
  "tr.snapchat.com",
  "bat.bing.com",
  "ct.pinterest.com",
  "tags.tiqcdn.com"
];
var IMG_REGEX = /<img\b[^>]*>/gi;
var SRC_REGEX = /\bsrc=["']([^"']*)["']/i;
var WIDTH_REGEX = /\bwidth=["']?(\d+)["']?/i;
var HEIGHT_REGEX = /\bheight=["']?(\d+)["']?/i;
function isTrackerDomain(src) {
  return TRACKER_DOMAINS.some((domain) => src.includes(domain));
}
function isTrackingPixel(imgTag) {
  const srcMatch = imgTag.match(SRC_REGEX);
  if (!srcMatch) return false;
  const src = srcMatch[1];
  if (isTrackerDomain(src)) return true;
  const widthMatch = imgTag.match(WIDTH_REGEX);
  const heightMatch = imgTag.match(HEIGHT_REGEX);
  if (widthMatch && heightMatch) {
    const w = parseInt(widthMatch[1], 10);
    const h = parseInt(heightMatch[1], 10);
    if (w <= 1 && h <= 1) return true;
  }
  return false;
}
function stripTrackers(html) {
  return html.replace(
    IMG_REGEX,
    (imgTag) => isTrackingPixel(imgTag) ? "" : imgTag
  );
}

// src/core/cleaner/link-cleaner.ts
var TRACKING_PARAMS = /* @__PURE__ */ new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "twclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "oly_anon_id",
  "oly_enc_id",
  "vero_id",
  "s_cid",
  "icid",
  "ef_id"
]);
var URL_IN_ATTR_REGEX = /\b(href|src)="([^"]*)"/gi;
function cleanUrl(raw) {
  const qIndex = raw.indexOf("?");
  if (qIndex === -1) return raw;
  const base = raw.slice(0, qIndex);
  const query = raw.slice(qIndex + 1);
  const params = query.split("&").filter((p) => {
    const key = p.split("=")[0].toLowerCase();
    return !TRACKING_PARAMS.has(key);
  });
  return params.length > 0 ? `${base}?${params.join("&")}` : base;
}
function cleanLinks(html) {
  return html.replace(URL_IN_ATTR_REGEX, (_, attr, url) => {
    return `${attr}="${cleanUrl(url)}"`;
  });
}

// src/core/cleaner/cleaner.ts
function cleanFeedContent(raw) {
  let result = raw;
  result = result.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, content) => {
    return `<![CDATA[${cleanLinks(stripTrackers(content))}]]>`;
  });
  result = result.replace(/&lt;([\s\S]*?)&gt;/g, (match) => {
    const decoded = match.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
    const cleaned = cleanLinks(stripTrackers(decoded));
    return cleaned.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  });
  return result;
}

// src/core/proxy/proxy-handler.ts
async function handleProxyRequest(req, defaultContentType, options) {
  const target = await extractTargetUrl(req);
  const validation = validateProxyUrl(target);
  if (!validation.ok) {
    const status = validation.error === "Access to internal addresses is blocked" ? 403 : 400;
    return new Response(validation.error, { status });
  }
  const url = validation.value.href;
  const cache = options?.cache;
  if (cache) {
    const cached = cache.get(url);
    if (cached) {
      return new Response(cached.body, {
        status: cached.status,
        headers: { "Content-Type": cached.contentType }
      });
    }
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15e3);
    const response = await fetch(url, {
      headers: { "User-Agent": "FeedZero/1.0 (RSS Reader)" },
      signal: controller.signal
    });
    clearTimeout(timeout);
    const contentType = response.headers.get("content-type") || defaultContentType;
    const body = await response.arrayBuffer();
    if (cache && response.status >= 200 && response.status < 400) {
      cache.set(url, body, contentType, response.status);
    }
    if (options?.catalogAdapter && response.status >= 200 && response.status < 400) {
      options.catalogAdapter.upsert(url).catch(() => {
      });
    }
    const isTextContent = /xml|html|text/i.test(contentType);
    if (options?.cleanContent && isTextContent && response.status >= 200 && response.status < 400) {
      const text = new TextDecoder().decode(body);
      const cleaned = cleanFeedContent(text);
      return new Response(cleaned, {
        status: response.status,
        headers: { "Content-Type": contentType }
      });
    }
    return new Response(body, {
      status: response.status,
      headers: { "Content-Type": contentType }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(
      JSON.stringify({
        level: "error",
        context: "proxy",
        target: url,
        error: message,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      })
    );
    return new Response(`Proxy error: ${message}`, { status: 502 });
  }
}
async function extractTargetUrl(req) {
  if (req.method === "POST") {
    try {
      const body = await req.json();
      return body.url ?? null;
    } catch {
      return null;
    }
  }
  const url = new URL(req.url, "http://localhost");
  return url.searchParams.get("url");
}

// api/icon.ts
async function GET(req) {
  return handleProxyRequest(req, "image/x-icon");
}
export {
  GET
};
