// @ts-nocheck
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

// src/core/stripe/webhook-handler.ts
var ROUTE = "/api/stripe/webhook";
var DEFAULT_TOLERANCE_SEC = 300;
function parseStripeSignatureHeader(header) {
  const parts = header.split(",");
  let ts = null;
  let v1 = null;
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) ts = parsed;
    } else if (key === "v1") {
      v1 = value;
    }
  }
  if (ts === null || v1 === null || v1.length === 0) return null;
  return { ts, v1 };
}
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
async function hmacSha256Hex(secret, payload) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
async function verifyAndParse(request, config) {
  const sigHeader = request.headers.get("Stripe-Signature");
  if (!sigHeader) {
    return { ok: false, status: 400, error: "Missing Stripe-Signature header" };
  }
  const parsed = parseStripeSignatureHeader(sigHeader);
  if (!parsed) {
    return {
      ok: false,
      status: 400,
      error: "Malformed Stripe-Signature header"
    };
  }
  const tolerance = config.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  const now = Math.floor(Date.now() / 1e3);
  if (Math.abs(now - parsed.ts) > tolerance) {
    return { ok: false, status: 400, error: "Timestamp outside tolerance" };
  }
  const rawBody = await request.text();
  const expected = await hmacSha256Hex(
    config.signingSecret,
    `${parsed.ts}.${rawBody}`
  );
  if (!constantTimeEqual(expected, parsed.v1)) {
    return { ok: false, status: 400, error: "Invalid signature" };
  }
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
  return { ok: true, value: { event } };
}
function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
function clientError(message, status, traceId) {
  return jsonResponse({ ok: false, error: message, traceId }, status);
}
function serverError(message, errClass, status, traceId, method) {
  logError({ route: ROUTE, method, status, traceId, errClass, errMsg: message });
  return jsonResponse({ ok: false, error: message, traceId }, status);
}
var OK_RESPONSE = { status: 200, body: { ok: true } };
function outcomeFromIssuerResult(result) {
  if (!result.ok) {
    return { status: 500, body: { ok: false, error: result.error } };
  }
  return OK_RESPONSE;
}
function acceptedWithIssue(issue) {
  return { status: 200, body: { ok: true, issue } };
}
function getString(obj, key) {
  const val = obj[key];
  return typeof val === "string" ? val : null;
}
function extractTier(subscription) {
  const items = subscription.items;
  const tier = items?.data?.[0]?.price?.metadata?.tier;
  return tier === "personal" || tier === "pro" ? tier : null;
}
async function handleSubscriptionCreated(obj, issuer) {
  const customerId = getString(obj, "customer");
  const subscriptionId = getString(obj, "id");
  const tier = extractTier(obj);
  if (!customerId || !subscriptionId) {
    return acceptedWithIssue("Missing customer or subscription id");
  }
  if (!tier) {
    return acceptedWithIssue("Missing tier metadata on price");
  }
  const expirySec = extractSubscriptionCurrentPeriodEnd(obj);
  return outcomeFromIssuerResult(
    await issuer.issue({
      customerId,
      subscriptionId,
      tier,
      ...expirySec !== null ? { expirySec } : {}
    })
  );
}
async function handleSubscriptionDeleted(obj, issuer) {
  const customerId = getString(obj, "customer");
  const subscriptionId = getString(obj, "id");
  if (!customerId || !subscriptionId) {
    return acceptedWithIssue("Missing customer or subscription id");
  }
  return outcomeFromIssuerResult(
    await issuer.revoke({
      customerId,
      subscriptionId,
      reason: "subscription_deleted"
    })
  );
}
async function handleSubscriptionUpdated(obj, issuer) {
  const customerId = getString(obj, "customer");
  const subscriptionId = getString(obj, "id");
  if (!customerId || !subscriptionId) {
    return acceptedWithIssue("Missing customer or subscription id");
  }
  if (isCancellationUpdate(obj)) {
    return outcomeFromIssuerResult(
      await issuer.revoke({
        customerId,
        subscriptionId,
        reason: "subscription_deleted"
      })
    );
  }
  const expirySec = extractSubscriptionCurrentPeriodEnd(obj);
  if (expirySec === null) {
    return acceptedWithIssue("Missing current_period_end");
  }
  return outcomeFromIssuerResult(
    await issuer.recordRenewal({ customerId, subscriptionId, expirySec })
  );
}
function extractSubscriptionCurrentPeriodEnd(obj) {
  const items = obj.items;
  const itemEnd = items?.data?.[0]?.current_period_end;
  if (typeof itemEnd === "number") return itemEnd;
  const topLevel = obj.current_period_end;
  return typeof topLevel === "number" ? topLevel : null;
}
function isCancellationUpdate(obj) {
  return obj.cancel_at_period_end === true && getString(obj, "status") === "canceled";
}
async function handleInvoicePaid(obj, issuer) {
  const customerId = getString(obj, "customer");
  const subscriptionId = extractInvoiceSubscription(obj);
  if (!customerId || !subscriptionId) {
    return {
      status: 200,
      body: { ok: true, ignored: "invoice.paid without subscription" }
    };
  }
  const expirySec = extractInvoicePeriodEnd(obj);
  if (expirySec === null) {
    return acceptedWithIssue("Missing line item period.end");
  }
  return outcomeFromIssuerResult(
    await issuer.recordRenewal({ customerId, subscriptionId, expirySec })
  );
}
function extractInvoiceSubscription(obj) {
  const parent = obj.parent;
  const newPath = parent?.subscription_details?.subscription;
  if (typeof newPath === "string") return newPath;
  return getString(obj, "subscription");
}
function extractInvoicePeriodEnd(obj) {
  const lines = obj.lines;
  const end = lines?.data?.[0]?.period?.end;
  return typeof end === "number" ? end : null;
}
async function dispatchEvent(event, issuer) {
  const obj = event.data?.object ?? {};
  switch (event.type) {
    case "customer.subscription.created":
      return handleSubscriptionCreated(obj, issuer);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(obj, issuer);
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(obj, issuer);
    case "invoice.paid":
      return handleInvoicePaid(obj, issuer);
    default:
      return {
        status: 200,
        body: { ok: true, ignored: event.type ?? "unknown" }
      };
  }
}
async function handleStripeWebhook(request, config) {
  const traceId = newTraceId();
  const method = request.method;
  if (method !== "POST") {
    return clientError("method not allowed", 405, traceId);
  }
  const verified = await verifyAndParse(request, config);
  if (!verified.ok) {
    return clientError(verified.error, verified.status, traceId);
  }
  if (config.killSignups?.()) {
    return clientError("signups disabled", 503, traceId);
  }
  const event = verified.value.event;
  if (config.eventStore && event.id) {
    const newSeen = await config.eventStore.markSeenIfNew(event.id);
    if (!newSeen.ok) {
      return serverError(newSeen.error, "EventStoreError", 500, traceId, method);
    }
    if (!newSeen.value) {
      return jsonResponse({ ok: true, alreadyProcessed: true }, 200);
    }
  }
  const outcome = await dispatchEvent(event, config.issuer);
  if (outcome.status >= 500) {
    const errMsg = typeof outcome.body?.error === "string" ? outcome.body.error : "dispatch failed";
    return serverError(errMsg, "DispatchFailed", outcome.status, traceId, method);
  }
  if (outcome.status === 200 && typeof outcome.body === "object" && outcome.body !== null && "issue" in outcome.body && typeof outcome.body.issue === "string") {
    logError({
      route: ROUTE,
      method,
      status: 200,
      traceId,
      errClass: "AcceptedWithIssue",
      errMsg: outcome.body.issue
    });
  }
  return jsonResponse(outcome.body, outcome.status);
}

// src/utils/result.ts
function ok(value) {
  return { ok: true, value };
}
function err(error) {
  return { ok: false, error };
}

// src/core/license/format.ts
var VERSION = "v1";
function encodeLicensePayload(payload) {
  if (payload.customerId.includes(":")) {
    throw new Error("customerId must not contain a colon (corrupts format)");
  }
  if (payload.keyId.includes(":")) {
    throw new Error("keyId must not contain a colon (corrupts format)");
  }
  return [
    VERSION,
    payload.tier,
    String(payload.expirySec),
    payload.customerId,
    payload.keyId,
    String(payload.issuedAtSec)
  ].join(":");
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

// src/core/license/sign.ts
var TOKEN_PREFIX = "fz_";
var PART_SEPARATOR = ".";
async function signLicense(payload, key) {
  const encodedPayload = encodeLicensePayload(payload);
  const signature = await hmacSha256(encodedPayload, key.secret);
  return TOKEN_PREFIX + base64UrlEncode(encodedPayload) + PART_SEPARATOR + base64UrlEncode(signature);
}

// src/core/license/issuer.ts
var DEFAULT_EXPIRY_SEC = 31 * 24 * 3600;
var KEY_ID_BYTE_LENGTH = 16;
var LicenseIssuerImpl = class {
  signingKey;
  storage;
  defaultExpirySec;
  nowSec;
  generateKeyId;
  constructor(config) {
    this.signingKey = config.signingKey;
    this.storage = config.storage;
    this.defaultExpirySec = config.defaultExpirySec ?? DEFAULT_EXPIRY_SEC;
    this.nowSec = config.nowSec ?? defaultNowSec;
    this.generateKeyId = config.generateKeyId ?? defaultGenerateKeyId;
  }
  /**
   * Issue a fresh license token, persist the record, and return both. The
   * admin endpoint and `recordRenewal`'s fallback path use this directly;
   * the Stripe webhook uses {@link issue} (which discards the token).
   */
  async issueWithToken(args) {
    return this.mintAndPersist(args);
  }
  /**
   * Interface method called by the Stripe webhook. The token is delivered
   * to the customer out of band (email), so the webhook only needs to know
   * issuance succeeded.
   */
  async issue(args) {
    const result = await this.mintAndPersist(args);
    return result.ok ? ok(void 0) : result;
  }
  /**
   * Revoke every license currently issued to `customerId`. The
   * subscriptionId is accepted for parity with the Stripe webhook contract
   * but is intentionally ignored: today we don't carry an index from
   * subscription → keyId, so we revoke at the customer level. This is
   * conservative — a customer with multiple subscriptions cancelled for
   * one will lose all licenses. Revisit when multi-subscription customers
   * become a real use case (currently they don't).
   */
  async revoke(args) {
    return this.storage.revokeAllForCustomer(args.customerId, args.reason);
  }
  /**
   * Update the matching record's expiry. If no record matches (Stripe
   * raced the create event), fall back to issuing a fresh license with
   * the new expiry — that keeps the (customerId, subscriptionId) →
   * active-license invariant holding even under reordered events.
   */
  async recordRenewal(args) {
    const existing = await this.findActiveRecordForSubscription(
      args.customerId,
      args.subscriptionId
    );
    if (!existing.ok) return existing;
    if (existing.value === null) {
      return this.issue({
        customerId: args.customerId,
        subscriptionId: args.subscriptionId,
        // Renewals don't carry tier, so we default to personal for the
        // fallback-issue path. Revisit when we surface tier on renewal events.
        tier: "personal",
        expirySec: args.expirySec
      });
    }
    const updated = {
      ...existing.value,
      expirySec: args.expirySec,
      updatedAtSec: this.nowSec()
    };
    return this.storage.put(updated);
  }
  async mintAndPersist(args) {
    const issuedAtSec = this.nowSec();
    const expirySec = args.expirySec ?? issuedAtSec + this.defaultExpirySec;
    const keyId = this.generateKeyId();
    const record = {
      keyId,
      customerId: args.customerId,
      subscriptionId: args.subscriptionId,
      tier: args.tier,
      status: "active",
      issuedAtSec,
      expirySec,
      updatedAtSec: issuedAtSec
    };
    const stored = await this.storage.put(record);
    if (!stored.ok) return stored;
    const token = await signLicense(
      {
        tier: args.tier,
        customerId: args.customerId,
        keyId,
        issuedAtSec,
        expirySec
      },
      this.signingKey
    );
    return ok({ token, record });
  }
  async findActiveRecordForSubscription(customerId, subscriptionId) {
    const list = await this.storage.listByCustomer(customerId);
    if (!list.ok) return list;
    const match = list.value.find(
      (r) => r.subscriptionId === subscriptionId && r.status === "active"
    );
    return ok(match ?? null);
  }
};
function defaultNowSec() {
  return Math.floor(Date.now() / 1e3);
}
function defaultGenerateKeyId() {
  const bytes = new Uint8Array(KEY_ID_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
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
  client;
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

// src/core/stripe/seen-event-store.ts
var KEY_PREFIX = "stripe:event:";
var DEFAULT_TTL_SEC = 7 * 24 * 60 * 60;
var MemorySeenEventStore = class {
  seen = /* @__PURE__ */ new Set();
  async markSeenIfNew(eventId) {
    if (this.seen.has(eventId)) return ok(false);
    this.seen.add(eventId);
    return ok(true);
  }
};
var UpstashSeenEventStore = class {
  constructor(client, ttlSec = DEFAULT_TTL_SEC) {
    this.client = client;
    this.ttlSec = ttlSec;
  }
  client;
  ttlSec;
  async markSeenIfNew(eventId) {
    try {
      const result = await this.client.set(KEY_PREFIX + eventId, "1", {
        nx: true,
        ex: this.ttlSec
      });
      return ok(result === "OK");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`upstash seen-event-store error: ${message}`);
    }
  }
};

// src/core/stripe/resolve-seen-event-store.ts
async function resolveSeenEventStore(env = process.env) {
  if (!hasUpstashCredentials(env)) {
    return new MemorySeenEventStore();
  }
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  const { Redis } = await import("@upstash/redis");
  return new UpstashSeenEventStore(
    new Redis({ url, token })
  );
}

// src/core/flags/flags.ts
function isFlagEnabled(name, env = process.env) {
  if (env.SELF_HOSTED === "1" && name === "LAUNCH_PAID_TIER") return false;
  return env[name] === "1";
}

// api/stripe/webhook.ts
var signingSecret = process.env.LICENSE_SIGNING_KEY ?? "";
var webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
var storagePromise = resolveLicenseStorage();
var eventStorePromise = resolveSeenEventStore();
var issuerPromise = storagePromise.then(
  (storage) => new LicenseIssuerImpl({
    signingKey: { secret: signingSecret },
    storage
  })
);
async function POST(req) {
  const [issuer, eventStore] = await Promise.all([
    issuerPromise,
    eventStorePromise
  ]);
  return handleStripeWebhook(req, {
    signingSecret: webhookSecret,
    issuer,
    eventStore,
    killSignups: () => isFlagEnabled("KILL_SIGNUPS")
  });
}
export {
  POST
};
