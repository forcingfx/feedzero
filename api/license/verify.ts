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

// src/core/license/verify-handler.ts
var JSON_HEADERS = { "Content-Type": "application/json" };
function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
async function handleLicenseVerifyRequest(request, options) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method not allowed" }, 405);
  }
  const tokenResult = await readTokenFromBody(request);
  if (!tokenResult.ok) {
    return jsonResponse({ ok: false, error: tokenResult.error }, 400);
  }
  const verified = await verifyLicense(tokenResult.token, options.signingKey, {
    nowSec: options.nowSec
  });
  if (!verified.ok) {
    return jsonResponse({ ok: false, error: verified.error }, 401);
  }
  const revoked = await options.storage.isRevoked(verified.value.keyId);
  if (!revoked.ok) {
    return jsonResponse(
      { ok: false, error: `license storage error: ${revoked.error}` },
      503
    );
  }
  if (revoked.value) {
    return jsonResponse({ ok: false, error: "license revoked" }, 401);
  }
  return jsonResponse({ ok: true, license: verified.value }, 200);
}
async function readTokenFromBody(request) {
  let parsed;
  try {
    parsed = await request.json();
  } catch {
    return { ok: false, error: "invalid JSON body" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const token = parsed.token;
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, error: "missing or invalid 'token' field" };
  }
  return { ok: true, token };
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

// api/license/verify.ts
var signingSecret = process.env.LICENSE_SIGNING_KEY ?? "";
var storage = new MemoryLicenseStorage();
async function POST(req) {
  return handleLicenseVerifyRequest(req, {
    signingKey: { secret: signingSecret },
    storage
  });
}
export {
  POST
};
