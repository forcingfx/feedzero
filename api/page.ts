// @ts-nocheck
// packages/core/src/utils/result.ts
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

// src/core/proxy/pick-user-agent.ts
var DEFAULT_USER_AGENT = "FeedZero/1.0 (RSS Reader)";
var BROWSER_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";
function pickUserAgent(env, routeKind = "feed") {
  const explicit = env.FEED_USER_AGENT;
  if (explicit && explicit.length > 0) return explicit;
  if (routeKind === "page") return BROWSER_USER_AGENT;
  if (env.SELF_HOSTED === "1") return BROWSER_USER_AGENT;
  return DEFAULT_USER_AGENT;
}

// packages/core/src/utils/log-error.ts
var ALLOWED_FIELDS = [
  "route",
  "method",
  "status",
  "traceId",
  "errClass",
  "errMsg"
];
function logError(fields) {
  const safe = {};
  for (const key of ALLOWED_FIELDS) {
    safe[key] = fields[key];
  }
  safe.ts = (/* @__PURE__ */ new Date()).toISOString();
  console.error(JSON.stringify(safe));
  if (fields.errClass === "AcceptedWithIssue") {
    const url = process.env.OPERATOR_ALERT_URL;
    if (url) {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safe)
      }).catch(() => {
      });
    }
  }
}

// packages/core/src/utils/trace-id.ts
function newTraceId() {
  return "req_" + crypto.randomUUID().split("-")[0];
}

// src/core/proxy/proxy-handler.ts
async function handleProxyRequest(req, defaultContentType, options) {
  if (options?.rateLimit) {
    const clientId = await options.rateLimit.clientIdFor(req);
    const result = await options.rateLimit.limiter.check(clientId);
    if (!result.allowed) {
      return new Response(
        JSON.stringify({ ok: false, error: "rate limit exceeded" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(result.retryAfterSec ?? 60)
          }
        }
      );
    }
  }
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
  const validators = await extractValidators(req);
  const upstreamHeaders = {
    "User-Agent": pickUserAgent(process.env, options?.routeKind)
  };
  if (validators.etag) upstreamHeaders["If-None-Match"] = validators.etag;
  if (validators.lastModified)
    upstreamHeaders["If-Modified-Since"] = validators.lastModified;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15e3);
    const response = await fetch(url, {
      headers: upstreamHeaders,
      signal: controller.signal
    });
    clearTimeout(timeout);
    const contentType = response.headers.get("content-type") || defaultContentType;
    if (response.status === 304) {
      return new Response("", {
        status: 304,
        headers: buildResponseHeaders(contentType, response)
      });
    }
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
        headers: buildResponseHeaders(contentType, response)
      });
    }
    return new Response(body, {
      status: response.status,
      headers: buildResponseHeaders(contentType, response)
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    logError({
      route: "/api/feed",
      method: "POST",
      status: 502,
      traceId: newTraceId(),
      errClass: e instanceof Error ? e.constructor.name : "Error",
      errMsg: message
    });
    return new Response(`Proxy error: ${message}`, { status: 502 });
  }
}
function buildResponseHeaders(contentType, upstream) {
  const headers = { "Content-Type": contentType };
  if (upstream.status === 429 || upstream.status === 503) {
    const retryAfter = upstream.headers.get("Retry-After");
    if (retryAfter) headers["Retry-After"] = retryAfter;
  }
  const etag = upstream.headers.get("ETag");
  if (etag) headers["ETag"] = etag;
  const lastModified = upstream.headers.get("Last-Modified");
  if (lastModified) headers["Last-Modified"] = lastModified;
  if (upstream.status >= 200 && upstream.status < 300 && /^image\//i.test(contentType)) {
    headers["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=604800";
  }
  return headers;
}
async function parseBody(req) {
  if (req.method !== "POST") {
    return { url: null, etag: null, lastModified: null };
  }
  try {
    const body = await req.clone().json();
    return {
      url: body.url ?? null,
      etag: body.etag ?? null,
      lastModified: body.lastModified ?? null
    };
  } catch {
    return { url: null, etag: null, lastModified: null };
  }
}
async function extractTargetUrl(req) {
  if (req.method === "POST") {
    const body = await parseBody(req);
    return body.url;
  }
  const url = new URL(req.url, "http://localhost");
  return url.searchParams.get("url");
}
async function extractValidators(req) {
  if (req.method !== "POST") return { etag: null, lastModified: null };
  const body = await parseBody(req);
  return { etag: body.etag, lastModified: body.lastModified };
}

// src/core/proxy/rate-limiter.ts
var KEY_PREFIX = "ratelimit:";
var UpstashRateLimiter = class {
  constructor(client, config) {
    this.client = client;
    this.config = config;
  }
  client;
  config;
  async check(clientId) {
    const key = KEY_PREFIX + clientId;
    try {
      const count = await this.client.incr(key);
      if (count === 1) {
        await this.client.expire(key, this.config.windowSec);
      }
      if (count > this.config.limit) {
        const ttl = await this.client.ttl(key);
        const retryAfterSec = ttl > 0 ? ttl : this.config.windowSec;
        return { allowed: false, retryAfterSec };
      }
      return { allowed: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(
        JSON.stringify({
          route: "rate-limiter",
          errClass: "UpstashRateLimitError",
          errMsg: message,
          ts: (/* @__PURE__ */ new Date()).toISOString()
        })
      );
      return { allowed: true };
    }
  }
};
async function hashClientId(request, salt) {
  const ip = extractClientIp(request);
  const ua = request.headers.get("user-agent") ?? "";
  const input = `${ip}|${ua}|${salt}`;
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(input)
  );
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < 4; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return "cli_" + hex;
}
function extractClientIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

// src/core/proxy/resolve-rate-limiter.ts
var DEFAULT_LIMIT = 300;
var DEFAULT_WINDOW_SEC = 60;
function hasUpstashCreds(env) {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}
function resolveSalt(env) {
  const explicit = env.RATE_LIMIT_HASH_SALT;
  if (explicit && explicit.length > 0) return explicit;
  const fallback = env.LICENSE_SIGNING_KEY;
  if (fallback && fallback.length > 0) return fallback;
  return null;
}
async function resolveProxyRateLimiter(env = process.env, config = {}) {
  const creds = hasUpstashCreds(env);
  if (!creds) return void 0;
  const salt = resolveSalt(env);
  if (!salt) return void 0;
  const { Redis } = await import("@upstash/redis");
  const client = new Redis({ url: creds.url, token: creds.token });
  const limiter = new UpstashRateLimiter(client, {
    limit: config.limit ?? DEFAULT_LIMIT,
    windowSec: config.windowSec ?? DEFAULT_WINDOW_SEC
  });
  return {
    limiter,
    clientIdFor: (req) => hashClientId(req, salt)
  };
}
function describeRateLimiterMode(env = process.env) {
  if (!hasUpstashCreds(env)) return "off";
  if (!resolveSalt(env)) return "off";
  return "upstash";
}

// api/page.ts
console.log(`[page-proxy] ratelimit=${describeRateLimiterMode()}`);
var rateLimitPromise = resolveProxyRateLimiter();
async function dispatch(req, contentType) {
  const rateLimit = await rateLimitPromise;
  return handleProxyRequest(req, contentType, {
    // Article-page fetches mimic a real browser visit so the FeedZero
    // identifier doesn't get blocked by Cloudflare-class WAFs on
    // article URLs. See pick-user-agent.ts for the policy.
    routeKind: "page",
    ...rateLimit ? { rateLimit } : {}
  });
}
async function GET(req) {
  return dispatch(req, "text/html");
}
async function POST(req) {
  return dispatch(req, "text/html");
}
export {
  GET,
  POST
};
