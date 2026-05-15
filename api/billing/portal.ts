// @ts-nocheck
// src/utils/result.ts
function ok(value) {
  return { ok: true, value };
}
function err(error) {
  return { ok: false, error };
}

// src/core/license/format.ts
var TIERS = ["free", "personal", "pro"];
var VERSION = "v1";
function decodeLicensePayload(encoded) {
  if (!encoded) return err("empty input");
  const parts = encoded.split(":");
  if (parts.length !== 6) {
    return err(`invalid format: expected 6 fields, got ${parts.length}`);
  }
  const [version, tier, expirySecRaw, customerId, keyId, issuedAtSecRaw] = parts;
  if (version !== VERSION) {
    return err(`unknown version: ${version}`);
  }
  if (!isLicenseTier(tier)) {
    return err(`unknown tier: ${tier}`);
  }
  const expirySec = Number(expirySecRaw);
  if (!Number.isFinite(expirySec) || !Number.isInteger(expirySec)) {
    return err(`expiry must be an integer number, got ${expirySecRaw}`);
  }
  const issuedAtSec = Number(issuedAtSecRaw);
  if (!Number.isFinite(issuedAtSec) || !Number.isInteger(issuedAtSec)) {
    return err(`issuedAt must be an integer number, got ${issuedAtSecRaw}`);
  }
  return ok({ tier, expirySec, customerId, keyId, issuedAtSec });
}
function isLicenseTier(value) {
  return TIERS.includes(value);
}

// src/core/license/crypto.ts
async function hmacSha256(message, secret) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message)
  );
  return new Uint8Array(signature);
}
function base64UrlEncode(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlDecodeToString(input) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - padded.length % 4) % 4;
  const b64 = padded + "=".repeat(padLen);
  try {
    return atob(b64);
  } catch {
    return "";
  }
}

// src/core/license/verify.ts
var TOKEN_PREFIX = "fz_";
async function verifyLicense(token, key, options = {}) {
  if (!token) return err("empty token");
  if (!token.startsWith(TOKEN_PREFIX)) {
    return err(`invalid token prefix (expected ${TOKEN_PREFIX})`);
  }
  const body = token.slice(TOKEN_PREFIX.length);
  const parts = body.split(".");
  if (parts.length !== 2) {
    return err(`invalid token format: expected 2 parts, got ${parts.length}`);
  }
  const [encodedPayloadB64, signatureB64] = parts;
  const encodedPayload = base64UrlDecodeToString(encodedPayloadB64);
  const expectedSignature = await hmacSha256(encodedPayload, key.secret);
  const expectedSignatureB64 = base64UrlEncode(expectedSignature);
  if (!constantTimeEqual(signatureB64, expectedSignatureB64)) {
    return err("invalid signature");
  }
  const payloadResult = decodeLicensePayload(encodedPayload);
  if (!payloadResult.ok) return payloadResult;
  const payload = payloadResult.value;
  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1e3);
  if (payload.issuedAtSec > nowSec) {
    return err(
      `token issuedAt is in the future (issuedAt=${payload.issuedAtSec}, now=${nowSec})`
    );
  }
  if (payload.expirySec < nowSec) {
    return err(
      `token expired (expired=${payload.expirySec}, now=${nowSec})`
    );
  }
  return ok(payload);
}
function constantTimeEqual(a, b) {
  if (a.length !== b.length) {
    let dummy = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) dummy |= a.charCodeAt(i) ^ b.charCodeAt(i);
    void dummy;
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// src/utils/trace-id.ts
function newTraceId() {
  return "req_" + crypto.randomUUID().split("-")[0];
}

// src/utils/log-error.ts
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
}

// src/core/stripe/portal-handler.ts
var ROUTE = "/api/billing/portal";
var JSON_HEADERS = { "Content-Type": "application/json" };
function okResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: JSON_HEADERS
  });
}
function clientError(message, status, traceId) {
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId }),
    { status, headers: JSON_HEADERS }
  );
}
function serverError(message, errClass, status, traceId, method) {
  logError({ route: ROUTE, method, status, traceId, errClass, errMsg: message });
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId }),
    { status, headers: JSON_HEADERS }
  );
}
var SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]+$/;
async function parseRequest(request) {
  let parsed;
  try {
    parsed = await request.json();
  } catch {
    return { ok: false, error: "invalid JSON body" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const obj = parsed;
  const returnUrl = obj.returnUrl;
  if (typeof returnUrl !== "string" || returnUrl.length === 0) {
    return { ok: false, error: "missing or invalid 'returnUrl'" };
  }
  if (!isHttpUrl(returnUrl)) {
    return { ok: false, error: "'returnUrl' must be an http(s) URL" };
  }
  const sessionId = obj.sessionId;
  let validatedSessionId;
  if (sessionId !== void 0) {
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return { ok: false, error: "invalid 'sessionId'" };
    }
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      return { ok: false, error: "invalid sessionId format" };
    }
    validatedSessionId = sessionId;
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const bearer = bearerMatch ? bearerMatch[1] : void 0;
  if (!validatedSessionId && !bearer) {
    return {
      ok: false,
      error: "provide either 'sessionId' or 'Authorization: Bearer'"
    };
  }
  return {
    ok: true,
    req: {
      sessionId: validatedSessionId,
      returnUrl,
      bearer
    }
  };
}
function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
async function resolveCustomerFromBearer(bearer, options) {
  const verified = await verifyLicense(bearer, options.signingKey, {
    nowSec: options.nowSec
  });
  if (!verified.ok) {
    return { ok: false, status: 401, error: verified.error };
  }
  const revoked = await options.storage.isRevoked(verified.value.keyId);
  if (!revoked.ok) {
    return {
      ok: false,
      status: 503,
      error: `license storage error: ${revoked.error}`,
      errClass: "LicenseStorageError"
    };
  }
  if (revoked.value) {
    return { ok: false, status: 401, error: "license revoked" };
  }
  return { ok: true, customerId: verified.value.customerId };
}
async function resolveCustomerFromSession(sessionId, options) {
  try {
    const session = await options.sessions.retrieve(sessionId);
    if (!session.customer) {
      return { ok: false, status: 404, error: "session has no customer" };
    }
    return { ok: true, customerId: session.customer };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 502,
      error: `stripe session lookup failed: ${message}`,
      errClass: "StripeApiError"
    };
  }
}
async function handlePortalRequest(request, options) {
  const traceId = newTraceId();
  const method = request.method;
  if (method !== "POST") {
    return clientError("method not allowed", 405, traceId);
  }
  const parsed = await parseRequest(request);
  if (!parsed.ok) {
    return clientError(parsed.error, 400, traceId);
  }
  const resolution = parsed.req.bearer ? await resolveCustomerFromBearer(parsed.req.bearer, options) : await resolveCustomerFromSession(parsed.req.sessionId, options);
  if (!resolution.ok) {
    if (resolution.status >= 500) {
      return serverError(
        resolution.error,
        resolution.errClass ?? "InternalError",
        resolution.status,
        traceId,
        method
      );
    }
    return clientError(resolution.error, resolution.status, traceId);
  }
  let session;
  try {
    session = await options.portal.create({
      customer: resolution.customerId,
      return_url: parsed.req.returnUrl
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return serverError(
      `stripe portal create failed: ${message}`,
      "StripeApiError",
      502,
      traceId,
      method
    );
  }
  return okResponse({ ok: true, url: session.url });
}

// src/core/license/storage.ts
var MemoryLicenseStorage = class {
  records = /* @__PURE__ */ new Map();
  denyList = /* @__PURE__ */ new Set();
  async put(record) {
    this.records.set(record.keyId, { ...record });
    return { ok: true, value: void 0 };
  }
  async get(keyId) {
    const record = this.records.get(keyId);
    return { ok: true, value: record ? { ...record } : null };
  }
  async listByCustomer(customerId) {
    const matches = [];
    for (const record of this.records.values()) {
      if (record.customerId === customerId) matches.push({ ...record });
    }
    return { ok: true, value: matches };
  }
  async revoke(keyId, _reason) {
    this.denyList.add(keyId);
    return { ok: true, value: void 0 };
  }
  async revokeAllForCustomer(customerId, _reason) {
    for (const record of this.records.values()) {
      if (record.customerId === customerId) this.denyList.add(record.keyId);
    }
    return { ok: true, value: void 0 };
  }
  async isRevoked(keyId) {
    return { ok: true, value: this.denyList.has(keyId) };
  }
};

// src/core/license/storage-upstash.ts
var RECORD_PREFIX = "license:record:";
var REVOKED_PREFIX = "license:revoked:";
var CUSTOMER_INDEX_PREFIX = "customer:";
var CUSTOMER_INDEX_SUFFIX = ":keys";
function recordKey(keyId) {
  return RECORD_PREFIX + keyId;
}
function revokedKey(keyId) {
  return REVOKED_PREFIX + keyId;
}
function customerIndexKey(customerId) {
  return CUSTOMER_INDEX_PREFIX + customerId + CUSTOMER_INDEX_SUFFIX;
}
async function tryUpstash(op) {
  try {
    return ok(await op());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`upstash storage error: ${message}`);
  }
}
var UpstashLicenseStorage = class {
  constructor(client) {
    this.client = client;
  }
  async put(record) {
    return tryUpstash(async () => {
      await this.client.set(recordKey(record.keyId), record);
      await this.client.sadd(customerIndexKey(record.customerId), record.keyId);
    });
  }
  async get(keyId) {
    return tryUpstash(() => this.client.get(recordKey(keyId)));
  }
  async listByCustomer(customerId) {
    const keysResult = await tryUpstash(
      () => this.client.smembers(customerIndexKey(customerId))
    );
    if (!keysResult.ok) return keysResult;
    const records = [];
    for (const keyId of keysResult.value) {
      const recordResult = await this.get(keyId);
      if (!recordResult.ok) return recordResult;
      if (recordResult.value !== null) records.push(recordResult.value);
    }
    return ok(records);
  }
  async revoke(keyId, reason) {
    return tryUpstash(async () => {
      await this.client.set(revokedKey(keyId), reason);
    });
  }
  async revokeAllForCustomer(customerId, reason) {
    const keysResult = await tryUpstash(
      () => this.client.smembers(customerIndexKey(customerId))
    );
    if (!keysResult.ok) return keysResult;
    for (const keyId of keysResult.value) {
      const revokeResult = await this.revoke(keyId, reason);
      if (!revokeResult.ok) return revokeResult;
    }
    return ok(void 0);
  }
  async isRevoked(keyId) {
    const result = await tryUpstash(
      () => this.client.exists(revokedKey(keyId))
    );
    if (!result.ok) return result;
    return ok(result.value === 1);
  }
};
function resolveUpstashCredentials(env) {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}
function hasUpstashCredentials(env = process.env) {
  return resolveUpstashCredentials(env) !== null;
}
async function createUpstashLicenseStorage(env = process.env) {
  const creds = resolveUpstashCredentials(env);
  if (!creds) {
    throw new Error(
      "Upstash REST credentials not found. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or use the Vercel Marketplace Upstash integration which auto-injects KV_REST_API_URL + KV_REST_API_TOKEN."
    );
  }
  const { Redis } = await import("@upstash/redis");
  return new UpstashLicenseStorage(
    new Redis({ url: creds.url, token: creds.token })
  );
}

// src/core/license/resolve-storage.ts
async function resolveLicenseStorage(env = process.env) {
  if (hasUpstashCredentials(env)) {
    return createUpstashLicenseStorage(env);
  }
  return new MemoryLicenseStorage();
}

// api/billing/portal.ts
var signingSecret = process.env.LICENSE_SIGNING_KEY ?? "";
var storagePromise = resolveLicenseStorage();
async function POST(req) {
  const storage = await storagePromise;
  return handlePortalRequest(req, {
    sessions: {
      retrieve: async (sessionId) => {
        const { default: Stripe } = await import("stripe");
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const customer = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
        return { customer };
      }
    },
    portal: {
      create: async (params) => {
        const { default: Stripe } = await import("stripe");
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
        const session = await stripe.billingPortal.sessions.create(params);
        return { url: session.url };
      }
    },
    signingKey: { secret: signingSecret },
    storage
  });
}
export {
  POST
};
