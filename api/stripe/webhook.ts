// @ts-nocheck
// src/core/stripe/webhook-handler.ts
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
async function handleSubscriptionCreated(obj, issuer2) {
  const customerId = getString(obj, "customer");
  const subscriptionId = getString(obj, "id");
  const tier = extractTier(obj);
  if (!customerId || !subscriptionId) {
    return acceptedWithIssue("Missing customer or subscription id");
  }
  if (!tier) {
    return acceptedWithIssue("Missing tier metadata on price");
  }
  return outcomeFromIssuerResult(
    await issuer2.issue({ customerId, subscriptionId, tier })
  );
}
async function handleSubscriptionDeleted(obj, issuer2) {
  const customerId = getString(obj, "customer");
  const subscriptionId = getString(obj, "id");
  if (!customerId || !subscriptionId) {
    return acceptedWithIssue("Missing customer or subscription id");
  }
  return outcomeFromIssuerResult(
    await issuer2.revoke({
      customerId,
      subscriptionId,
      reason: "subscription_deleted"
    })
  );
}
async function handleSubscriptionUpdated(obj, issuer2) {
  const customerId = getString(obj, "customer");
  const subscriptionId = getString(obj, "id");
  if (!customerId || !subscriptionId) {
    return acceptedWithIssue("Missing customer or subscription id");
  }
  if (isCancellationUpdate(obj)) {
    return outcomeFromIssuerResult(
      await issuer2.revoke({
        customerId,
        subscriptionId,
        reason: "subscription_deleted"
      })
    );
  }
  const expirySec = obj.current_period_end;
  if (typeof expirySec !== "number") {
    return acceptedWithIssue("Missing current_period_end");
  }
  return outcomeFromIssuerResult(
    await issuer2.recordRenewal({ customerId, subscriptionId, expirySec })
  );
}
function isCancellationUpdate(obj) {
  return obj.cancel_at_period_end === true && getString(obj, "status") === "canceled";
}
async function handleInvoicePaid(obj, issuer2) {
  const customerId = getString(obj, "customer");
  const subscriptionId = getString(obj, "subscription");
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
    await issuer2.recordRenewal({ customerId, subscriptionId, expirySec })
  );
}
function extractInvoicePeriodEnd(obj) {
  const lines = obj.lines;
  const end = lines?.data?.[0]?.period?.end;
  return typeof end === "number" ? end : null;
}
async function dispatchEvent(event, issuer2) {
  const obj = event.data?.object ?? {};
  switch (event.type) {
    case "customer.subscription.created":
      return handleSubscriptionCreated(obj, issuer2);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(obj, issuer2);
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(obj, issuer2);
    case "invoice.paid":
      return handleInvoicePaid(obj, issuer2);
    default:
      return {
        status: 200,
        body: { ok: true, ignored: event.type ?? "unknown" }
      };
  }
}
async function handleStripeWebhook(request, config) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const verified = await verifyAndParse(request, config);
  if (!verified.ok) {
    return jsonResponse({ ok: false, error: verified.error }, verified.status);
  }
  if (config.killSignups?.()) {
    return jsonResponse({ ok: false, error: "signups disabled" }, 503);
  }
  const outcome = await dispatchEvent(verified.value.event, config.issuer);
  return jsonResponse(outcome.body, outcome.status);
}

// src/utils/result.ts
function ok(value) {
  return { ok: true, value };
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

// src/core/flags/flags.ts
function isFlagEnabled(name, env = process.env) {
  return env[name] === "1";
}

// api/stripe/webhook.ts
var signingSecret = process.env.LICENSE_SIGNING_KEY ?? "";
var webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
var storage = new MemoryLicenseStorage();
var issuer = new LicenseIssuerImpl({
  signingKey: { secret: signingSecret },
  storage
});
async function POST(req) {
  return handleStripeWebhook(req, {
    signingSecret: webhookSecret,
    issuer,
    killSignups: () => isFlagEnabled("KILL_SIGNUPS")
  });
}
export {
  POST
};
