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

// src/core/license/verify-handler.ts
var ROUTE = "/api/license/verify";
var JSON_HEADERS = { "Content-Type": "application/json" };
function okResponse(body, status) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
function clientError(message, status, traceId) {
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId }),
    { status, headers: JSON_HEADERS }
  );
}
function serverError(message, errClass, status, traceId, method) {
  logError({
    route: ROUTE,
    method,
    status,
    traceId,
    errClass,
    errMsg: message
  });
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId }),
    { status, headers: JSON_HEADERS }
  );
}
async function handleLicenseVerifyRequest(request, options) {
  const traceId = newTraceId();
  const method = request.method;
  if (method !== "POST") {
    return clientError("method not allowed", 405, traceId);
  }
  const tokenResult = await readTokenFromBody(request);
  if (!tokenResult.ok) {
    return clientError(tokenResult.error, 400, traceId);
  }
  const verified = await verifyLicense(tokenResult.token, options.signingKey, {
    nowSec: options.nowSec
  });
  if (!verified.ok) {
    return clientError(verified.error, 401, traceId);
  }
  const revoked = await options.storage.isRevoked(verified.value.keyId);
  if (!revoked.ok) {
    return serverError(
      `license storage error: ${revoked.error}`,
      "LicenseStorageError",
      503,
      traceId,
      method
    );
  }
  if (revoked.value) {
    return clientError("license revoked", 401, traceId);
  }
  return okResponse({ ok: true, license: verified.value }, 200);
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

// src/core/license/issue-handler.ts
var ROUTE2 = "/api/license/issue";
var JSON_HEADERS2 = { "Content-Type": "application/json" };
var BEARER_SCHEME = "Bearer ";
function okResponse2(body, status) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS2 });
}
function clientError2(message, status, traceId) {
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId }),
    { status, headers: JSON_HEADERS2 }
  );
}
function serverError2(message, errClass, status, traceId, method) {
  logError({ route: ROUTE2, method, status, traceId, errClass, errMsg: message });
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId }),
    { status, headers: JSON_HEADERS2 }
  );
}
function constantTimeEqual2(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
function checkAdminAuth(authorizationHeader, adminApiKey) {
  if (!adminApiKey) {
    return { ok: false, status: 503, error: "admin endpoint not configured" };
  }
  if (!authorizationHeader) {
    return { ok: false, status: 401, error: "missing Authorization header" };
  }
  if (!authorizationHeader.startsWith(BEARER_SCHEME)) {
    return {
      ok: false,
      status: 401,
      error: "invalid Authorization scheme (expected Bearer)"
    };
  }
  const token = authorizationHeader.slice(BEARER_SCHEME.length);
  if (!constantTimeEqual2(token, adminApiKey)) {
    return { ok: false, status: 401, error: "invalid admin token" };
  }
  return { ok: true };
}
async function readIssueArgsFromBody(request) {
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
  const customerId = obj.customerId;
  if (typeof customerId !== "string" || customerId.length === 0) {
    return { ok: false, error: "missing or invalid 'customerId'" };
  }
  if (customerId.includes(":")) {
    return { ok: false, error: "'customerId' must not contain ':'" };
  }
  const tier = obj.tier;
  if (tier !== "personal" && tier !== "pro") {
    return { ok: false, error: "'tier' must be 'personal' or 'pro'" };
  }
  const subscriptionId = obj.subscriptionId;
  if (subscriptionId !== void 0 && typeof subscriptionId !== "string") {
    return { ok: false, error: "'subscriptionId' must be a string if provided" };
  }
  const expirySec = obj.expirySec;
  if (expirySec !== void 0 && (typeof expirySec !== "number" || !Number.isInteger(expirySec))) {
    return { ok: false, error: "'expirySec' must be an integer if provided" };
  }
  const args = { customerId, tier };
  if (typeof subscriptionId === "string") args.subscriptionId = subscriptionId;
  if (typeof expirySec === "number") args.expirySec = expirySec;
  return { ok: true, args };
}
async function handleLicenseIssueRequest(request, options) {
  const traceId = newTraceId();
  const method = request.method;
  if (method !== "POST") {
    return clientError2("method not allowed", 405, traceId);
  }
  const auth = checkAdminAuth(
    request.headers.get("Authorization"),
    options.adminApiKey
  );
  if (!auth.ok) {
    if (auth.status === 503) {
      return serverError2(auth.error, "AdminEndpointNotConfigured", 503, traceId, method);
    }
    return clientError2(auth.error, auth.status, traceId);
  }
  if (options.killSignups?.()) {
    return clientError2("signups disabled", 503, traceId);
  }
  const body = await readIssueArgsFromBody(request);
  if (!body.ok) {
    return clientError2(body.error, 400, traceId);
  }
  const issueResult = await options.issuer.issueWithToken({
    customerId: body.args.customerId,
    tier: body.args.tier,
    subscriptionId: body.args.subscriptionId ?? "",
    ...body.args.expirySec !== void 0 ? { expirySec: body.args.expirySec } : {}
  });
  if (!issueResult.ok) {
    return serverError2(
      `issue failed: ${issueResult.error}`,
      "IssueFailed",
      500,
      traceId,
      method
    );
  }
  return okResponse2(
    { ok: true, token: issueResult.value.token, record: issueResult.value.record },
    200
  );
}

// src/core/license/sign.ts
var TOKEN_PREFIX2 = "fz_";
var PART_SEPARATOR = ".";
async function signLicense(payload, key) {
  const encodedPayload = encodeLicensePayload(payload);
  const signature = await hmacSha256(encodedPayload, key.secret);
  return TOKEN_PREFIX2 + base64UrlEncode(encodedPayload) + PART_SEPARATOR + base64UrlEncode(signature);
}

// src/core/license/retrieve-handler.ts
var ROUTE3 = "/api/license/retrieve";
var JSON_HEADERS3 = { "Content-Type": "application/json" };
function okResponse3(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: JSON_HEADERS3
  });
}
function pendingResponse() {
  return new Response(
    JSON.stringify({ ok: false, pending: true }),
    { status: 202, headers: JSON_HEADERS3 }
  );
}
function clientError3(message, status, traceId) {
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId }),
    { status, headers: JSON_HEADERS3 }
  );
}
function serverError3(message, errClass, status, traceId, method) {
  logError({
    route: ROUTE3,
    method,
    status,
    traceId,
    errClass,
    errMsg: message
  });
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId }),
    { status, headers: JSON_HEADERS3 }
  );
}
async function handleLicenseRetrieveRequest(request, options) {
  const traceId = newTraceId();
  const method = request.method;
  if (method !== "POST") {
    return clientError3("method not allowed", 405, traceId);
  }
  const parsed = await parseBody(request);
  if (!parsed.ok) {
    return clientError3(parsed.error, 400, traceId);
  }
  let customerId;
  try {
    const session = await options.sessions.retrieve(parsed.sessionId);
    customerId = session.customer;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return serverError3(
      `stripe session lookup failed: ${message}`,
      "StripeApiError",
      502,
      traceId,
      method
    );
  }
  if (!customerId) {
    return clientError3("session has no customer", 404, traceId);
  }
  const records = await options.storage.listByCustomer(customerId);
  if (!records.ok) {
    return serverError3(
      `license storage error: ${records.error}`,
      "LicenseStorageError",
      503,
      traceId,
      method
    );
  }
  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1e3);
  const candidate = await findActiveUnrevokedRecord(
    records.value,
    nowSec,
    options.storage
  );
  if (!candidate.ok) {
    return serverError3(
      `license storage error: ${candidate.error}`,
      "LicenseStorageError",
      503,
      traceId,
      method
    );
  }
  if (candidate.value === null) {
    return pendingResponse();
  }
  const token = await signLicense(
    {
      tier: candidate.value.tier,
      customerId: candidate.value.customerId,
      keyId: candidate.value.keyId,
      issuedAtSec: candidate.value.issuedAtSec,
      expirySec: candidate.value.expirySec
    },
    options.signingKey
  );
  return okResponse3({ ok: true, token });
}
var SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]+$/;
async function parseBody(request) {
  let parsed;
  try {
    parsed = await request.json();
  } catch {
    return { ok: false, error: "invalid JSON body" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const sessionId = parsed.sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return { ok: false, error: "missing or invalid 'sessionId' field" };
  }
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return { ok: false, error: "invalid sessionId format" };
  }
  return { ok: true, sessionId };
}
async function findActiveUnrevokedRecord(records, nowSec, storage) {
  const fresh = [...records].filter((r) => r.expirySec >= nowSec).sort((a, b) => b.issuedAtSec - a.issuedAtSec);
  for (const record of fresh) {
    const revoked = await storage.isRevoked(record.keyId);
    if (!revoked.ok) return revoked;
    if (!revoked.value) {
      return { ok: true, value: record };
    }
  }
  return { ok: true, value: null };
}

// src/core/stripe/find-customer-by-email.ts
async function findCustomerByEmail(client, email) {
  try {
    const list = await client.list({ email, limit: 1 });
    return ok({ customer: list.data[0] ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`stripe customer lookup failed: ${message}`);
  }
}

// src/core/license/recover-handler.ts
var ROUTE4 = "/api/license/recover";
var JSON_HEADERS4 = { "Content-Type": "application/json" };
function okResponse4(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: JSON_HEADERS4
  });
}
function clientError4(message, status, traceId) {
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId }),
    { status, headers: JSON_HEADERS4 }
  );
}
function serverError4(message, errClass, status, traceId, method) {
  logError({ route: ROUTE4, method, status, traceId, errClass, errMsg: message });
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId }),
    { status, headers: JSON_HEADERS4 }
  );
}
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function parseRequest(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return err("invalid JSON body");
  }
  if (!body || typeof body !== "object") {
    return err("body must be a JSON object");
  }
  const obj = body;
  const email = obj.email;
  if (typeof email !== "string" || email.length === 0) {
    return err("missing 'email'");
  }
  if (email.length > 320 || !EMAIL_RE.test(email)) {
    return err("invalid email shape");
  }
  return ok({ email });
}
async function handleLicenseRecoverRequest(request, options) {
  const traceId = newTraceId();
  const method = request.method;
  if (method !== "POST") {
    return clientError4("method not allowed", 405, traceId);
  }
  const parsed = await parseRequest(request);
  if (!parsed.ok) {
    return clientError4(parsed.error, 400, traceId);
  }
  const lookup = await findCustomerByEmail(
    options.customers,
    parsed.value.email
  );
  if (!lookup.ok) {
    return serverError4(
      lookup.error,
      "StripeApiError",
      502,
      traceId,
      method
    );
  }
  const customer = lookup.value.customer;
  if (!customer) {
    return okResponse4({ ok: true });
  }
  const nowSec = options.nowSec ? options.nowSec() : Math.floor(Date.now() / 1e3);
  const ttlSec = options.ttlSec ?? 900;
  const recoveryToken = await signRecoveryToken(
    { customerId: customer.id, exp: nowSec + ttlSec },
    options.signingKey
  );
  const returnUrl = `${options.returnUrlBase}?recovery=${encodeURIComponent(recoveryToken)}`;
  let portalUrl;
  try {
    const session = await options.portal.create({
      customer: customer.id,
      return_url: returnUrl
    });
    portalUrl = session.url;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return serverError4(
      `stripe portal session failed: ${message}`,
      "StripeApiError",
      502,
      traceId,
      method
    );
  }
  return okResponse4({ ok: true, portalUrl });
}
async function signRecoveryToken(payload, key) {
  const json = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(json);
  const sigBytes = await hmacSha256(encodedPayload, key.secret);
  const encodedSig = base64UrlEncodeBytes(sigBytes);
  return `${encodedPayload}.${encodedSig}`;
}
async function verifyRecoveryToken(token, key, nowSec) {
  if (typeof token !== "string" || !token.includes(".")) {
    return err("malformed recovery token");
  }
  const [encodedPayload, providedSig] = token.split(".");
  if (!encodedPayload || !providedSig) {
    return err("malformed recovery token");
  }
  const expectedSigBytes = await hmacSha256(encodedPayload, key.secret);
  const expectedSig = base64UrlEncodeBytes(expectedSigBytes);
  if (!timingSafeEqual(expectedSig, providedSig)) {
    return err("recovery token signature invalid");
  }
  const json = base64UrlDecodeToString(encodedPayload);
  if (!json) return err("recovery token payload undecodable");
  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    return err("recovery token payload not JSON");
  }
  if (!payload || typeof payload !== "object" || typeof payload.customerId !== "string" || typeof payload.exp !== "number") {
    return err("recovery token payload shape invalid");
  }
  const typed = payload;
  const now = nowSec ?? Math.floor(Date.now() / 1e3);
  if (typed.exp <= now) {
    return err("recovery token expired");
  }
  return ok(typed);
}
function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// src/core/license/issue-from-recovery-handler.ts
var ROUTE5 = "/api/license/issue-from-recovery";
var JSON_HEADERS5 = { "Content-Type": "application/json" };
function clientError5(message, status, traceId) {
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId }),
    { status, headers: JSON_HEADERS5 }
  );
}
function serverError5(message, errClass, status, traceId, method) {
  logError({ route: ROUTE5, method, status, traceId, errClass, errMsg: message });
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId }),
    { status, headers: JSON_HEADERS5 }
  );
}
async function handleIssueFromRecoveryRequest(request, options) {
  const traceId = newTraceId();
  const method = request.method;
  if (method !== "POST") {
    return clientError5("method not allowed", 405, traceId);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return clientError5("invalid JSON body", 400, traceId);
  }
  const recoveryToken = body?.recoveryToken;
  if (typeof recoveryToken !== "string" || recoveryToken.length === 0) {
    return clientError5("missing 'recoveryToken'", 400, traceId);
  }
  const nowSec = options.nowSec ? options.nowSec() : Math.floor(Date.now() / 1e3);
  const verified = await verifyRecoveryToken(
    recoveryToken,
    options.signingKey,
    nowSec
  );
  if (!verified.ok) {
    return clientError5(verified.error, 401, traceId);
  }
  const { customerId } = verified.value;
  const records = await options.storage.listByCustomer(customerId);
  if (!records.ok) {
    return serverError5(
      `license storage error: ${records.error}`,
      "LicenseStorageError",
      503,
      traceId,
      method
    );
  }
  if (records.value.length === 0) {
    return clientError5("no license record for customer", 404, traceId);
  }
  const candidate = await pickActiveUnrevokedRecord(
    records.value,
    nowSec,
    options.storage
  );
  if (!candidate) {
    return clientError5("no active license record for customer", 404, traceId);
  }
  if (candidate.subscriptionId) {
    let subStatus;
    try {
      const sub = await options.subscriptions.retrieve(candidate.subscriptionId);
      subStatus = sub.status;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return serverError5(
        `stripe subscription lookup failed: ${message}`,
        "StripeApiError",
        502,
        traceId,
        method
      );
    }
    if (subStatus !== "active" && subStatus !== "trialing") {
      return clientError5(
        `subscription is not active (status: ${subStatus})`,
        403,
        traceId
      );
    }
  }
  const token = await signLicense(
    {
      tier: candidate.tier,
      customerId: candidate.customerId,
      keyId: candidate.keyId,
      issuedAtSec: candidate.issuedAtSec,
      expirySec: candidate.expirySec
    },
    options.signingKey
  );
  return new Response(
    JSON.stringify({ ok: true, token, tier: candidate.tier }),
    { status: 200, headers: JSON_HEADERS5 }
  );
}
async function pickActiveUnrevokedRecord(records, nowSec, storage) {
  const sorted = [...records].sort((a, b) => b.issuedAtSec - a.issuedAtSec);
  for (const rec of sorted) {
    if (rec.expirySec <= nowSec) continue;
    const revoked = await storage.isRevoked(rec.keyId);
    if (!revoked.ok) return null;
    if (revoked.value) continue;
    return rec;
  }
  return null;
}

// src/core/stripe/portal-handler.ts
var ROUTE6 = "/api/billing/portal";
var JSON_HEADERS6 = { "Content-Type": "application/json" };
function okResponse5(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: JSON_HEADERS6
  });
}
function clientError6(message, status, traceId) {
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId }),
    { status, headers: JSON_HEADERS6 }
  );
}
function serverError6(message, errClass, status, traceId, method) {
  logError({ route: ROUTE6, method, status, traceId, errClass, errMsg: message });
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId }),
    { status, headers: JSON_HEADERS6 }
  );
}
var SESSION_ID_PATTERN2 = /^cs_(test|live)_[A-Za-z0-9]+$/;
async function parseRequest2(request) {
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
    if (!SESSION_ID_PATTERN2.test(sessionId)) {
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
    return clientError6("method not allowed", 405, traceId);
  }
  const parsed = await parseRequest2(request);
  if (!parsed.ok) {
    return clientError6(parsed.error, 400, traceId);
  }
  const resolution = parsed.req.bearer ? await resolveCustomerFromBearer(parsed.req.bearer, options) : await resolveCustomerFromSession(parsed.req.sessionId, options);
  if (!resolution.ok) {
    if (resolution.status >= 500) {
      return serverError6(
        resolution.error,
        resolution.errClass ?? "InternalError",
        resolution.status,
        traceId,
        method
      );
    }
    return clientError6(resolution.error, resolution.status, traceId);
  }
  let session;
  try {
    session = await options.portal.create({
      customer: resolution.customerId,
      return_url: parsed.req.returnUrl
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return serverError6(
      `stripe portal create failed: ${message}`,
      "StripeApiError",
      502,
      traceId,
      method
    );
  }
  return okResponse5({ ok: true, url: session.url });
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

// src/core/flags/flags.ts
function isFlagEnabled(name, env = process.env) {
  if (env.SELF_HOSTED === "1" && name === "LAUNCH_PAID_TIER") return false;
  return env[name] === "1";
}

// api/license/[action].ts
var signingSecret = process.env.LICENSE_SIGNING_KEY ?? "";
var storagePromise = resolveLicenseStorage();
var issuerPromise = storagePromise.then(
  (storage) => new LicenseIssuerImpl({
    signingKey: { secret: signingSecret },
    storage
  })
);
async function POST(req) {
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();
  if (action === "verify") {
    const storage = await storagePromise;
    return handleLicenseVerifyRequest(req, {
      signingKey: { secret: signingSecret },
      storage
    });
  }
  if (action === "issue") {
    const issuer = await issuerPromise;
    return handleLicenseIssueRequest(req, {
      issuer,
      adminApiKey: process.env.ADMIN_API_KEY ?? "",
      killSignups: () => isFlagEnabled("KILL_SIGNUPS")
    });
  }
  if (action === "retrieve") {
    const storage = await storagePromise;
    return handleLicenseRetrieveRequest(req, {
      sessions: {
        retrieve: async (sessionId) => {
          const { default: Stripe } = await import("stripe");
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          const customer = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
          return { customer };
        }
      },
      storage,
      signingKey: { secret: signingSecret }
    });
  }
  if (action === "portal") {
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
  if (action === "recover") {
    return handleLicenseRecoverRequest(req, {
      customers: {
        list: async (params) => {
          const { default: Stripe } = await import("stripe");
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
          const list = await stripe.customers.list({
            email: params.email,
            limit: params.limit ?? 1
          });
          return {
            data: list.data.map((c) => ({ id: c.id, email: c.email ?? null }))
          };
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
      returnUrlBase: `${new URL(req.url).origin}/billing/issued`
    });
  }
  if (action === "issue-from-recovery") {
    const storage = await storagePromise;
    return handleIssueFromRecoveryRequest(req, {
      signingKey: { secret: signingSecret },
      storage,
      subscriptions: {
        retrieve: async (subscriptionId) => {
          const { default: Stripe } = await import("stripe");
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          return { status: sub.status };
        }
      }
    });
  }
  return new Response(
    JSON.stringify({ ok: false, error: "unknown license action" }),
    { status: 404, headers: { "Content-Type": "application/json" } }
  );
}
export {
  POST
};
